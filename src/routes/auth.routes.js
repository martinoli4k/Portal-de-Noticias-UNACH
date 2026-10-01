const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const {
  authenticateToken,
  generateAccessToken,
  generateRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens
} = require('../middleware/auth');
const { getUserPermissions } = require('../middleware/permissions');
const { logAudit, getClientIp } = require('../middleware/audit');
const { authLimiter } = require('../middleware/rateLimiter');
const { sanitizeInput, isValidEmail, isValidPassword } = require('../middleware/sanitizer');
const emailService = require('../services/email.service');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Aplicar sanitización a todas las rutas de autenticación
router.use(sanitizeInput);

/**
 * 1. Registro de Usuario
 */
router.post('/register', authLimiter, (req, res) => {
  const { nombre, email, password } = req.body;
  const ip = getClientIp(req);

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Formato de correo electrónico inválido' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'El correo electrónico ya se encuentra registrado' });
    }

    // Rol por defecto: Usuario Regular (Lector)
    const regularRole = db.prepare('SELECT id FROM roles WHERE nombre_rol = ?').get('Usuario Regular');
    const roleId = regularRole ? regularRole.id : 3;

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const insert = db.prepare('INSERT INTO usuarios (nombre, email, password, id_rol) VALUES (?, ?, ?, ?)');
    const result = insert.run(nombre, email, hashedPassword, roleId);
    const userId = Number(result.lastInsertRowid);

    logAudit(userId, 'Registro de Usuario', `Nuevo usuario registrado: ${nombre} (${email})`, ip);

    const user = {
      id: userId,
      nombre,
      email,
      id_rol: roleId,
      nombre_rol: 'Usuario Regular'
    };

    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(userId);
    const permissions = getUserPermissions(roleId);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      refreshToken,
      user,
      permissions
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno al registrar el usuario' });
  }
});

/**
 * 2. Inicio de Sesión (Con protección contra fuerza bruta)
 */
router.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  const ip = getClientIp(req);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const user = db.prepare(`
      SELECT u.id, u.nombre, u.email, u.password, u.id_rol, u.intentos_fallidos,
             u.bloqueado_hasta, r.nombre_rol
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id
      WHERE u.email = ?
    `).get(email);

    if (!user) {
      logAudit(null, 'Intento de Inicio de Sesión Fallido', `Usuario inexistente: ${email}`, ip);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const now = new Date();

    // Validar si la cuenta está actualmente bloqueada
    if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > now) {
      const remainingMinutes = Math.ceil((new Date(user.bloqueado_hasta) - now) / 60000);
      logAudit(user.id, 'Intento de Acceso a Cuenta Bloqueada', `Cuenta temporalmente bloqueada para ${email}`, ip);
      return res.status(423).json({
        error: `Cuenta bloqueada temporalmente por seguridad debido a múltiples intentos fallidos. Intenta nuevamente en ${remainingMinutes} minuto(s).`
      });
    }

    const isValid = bcrypt.compareSync(password, user.password);

    if (!isValid) {
      const intentos = (user.intentos_fallidos || 0) + 1;

      if (intentos >= MAX_FAILED_ATTEMPTS) {
        const lockoutTime = new Date(now.getTime() + LOCKOUT_MINUTES * 60000).toISOString();
        db.prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?')
          .run(intentos, lockoutTime, user.id);

        logAudit(
          user.id,
          'Bloqueo Temporal de Cuenta',
          `Cuenta bloqueada por ${LOCKOUT_MINUTES} minutos tras ${MAX_FAILED_ATTEMPTS} intentos fallidos`,
          ip
        );

        return res.status(423).json({
          error: `Has superado el límite de intentos permitidos (${MAX_FAILED_ATTEMPTS}). Tu cuenta ha sido bloqueada temporalmente por ${LOCKOUT_MINUTES} minutos por seguridad.`
        });
      } else {
        db.prepare('UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?').run(intentos, user.id);
        const restantes = MAX_FAILED_ATTEMPTS - intentos;

        logAudit(user.id, 'Intento de Inicio de Sesión Fallido', `Contraseña incorrecta para ${email} (Intento ${intentos}/${MAX_FAILED_ATTEMPTS})`, ip);

        return res.status(401).json({
          error: `Credenciales inválidas. Te quedan ${restantes} intento(s) antes del bloqueo temporal.`
        });
      }
    }

    // Login exitoso: restablecer contadores de fallos
    db.prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?').run(user.id);

    logAudit(user.id, 'Inicio de Sesión', `Usuario ${user.nombre} (${user.nombre_rol}) inició sesión`, ip);

    const userPayload = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      id_rol: user.id_rol,
      nombre_rol: user.nombre_rol
    };

    const token = generateAccessToken(userPayload);
    const refreshToken = generateRefreshToken(user.id);

    const permissions = user.nombre_rol === 'Administrador'
      ? ['*']
      : getUserPermissions(user.id_rol);

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      refreshToken,
      user: userPayload,
      permissions
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno en el servidor' });
  }
});

/**
 * 3. Renovación de Access Token (Refresh Token)
 */
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token requerido' });
  }

  const user = validateRefreshToken(refreshToken);

  if (!user) {
    return res.status(401).json({ error: 'Refresh token inválido o expirado. Inicia sesión nuevamente.' });
  }

  const newToken = generateAccessToken(user);
  const permissions = user.nombre_rol === 'Administrador'
    ? ['*']
    : getUserPermissions(user.id_rol);

  res.json({
    token: newToken,
    refreshToken,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      id_rol: user.id_rol,
      nombre_rol: user.nombre_rol
    },
    permissions
  });
});

/**
 * 4. Obtener perfil de usuario actual
 */
router.get('/me', authenticateToken, (req, res) => {
  const permissions = req.user.nombre_rol === 'Administrador'
    ? ['*']
    : getUserPermissions(req.user.id_rol);

  res.json({
    user: req.user,
    permissions
  });
});

/**
 * 5. Cambio de Contraseña (Usuario Autenticado)
 */
router.post('/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const ip = getClientIp(req);

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Debes proporcionar la contraseña actual y la nueva contraseña' });
  }

  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const user = db.prepare('SELECT password FROM usuarios WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const isValid = bcrypt.compareSync(currentPassword, user.password);
    if (!isValid) {
      logAudit(req.user.id, 'Fallo en Cambio de Contraseña', 'Contraseña actual incorrecta', ip);
      return res.status(400).json({ error: 'La contraseña actual ingresada es incorrecta' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hashedPassword, req.user.id);

    // Por seguridad, revocar sesiones previas
    revokeAllUserTokens(req.user.id);

    logAudit(req.user.id, 'Cambio de Contraseña', 'Contraseña modificada exitosamente por el usuario', ip);

    res.json({ message: 'Tu contraseña ha sido actualizada correctamente.' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'Error interno al actualizar la contraseña' });
  }
});

/**
 * 6. Solicitud de Recuperación de Contraseña (Envío Real de Correo)
 */
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  const ip = getClientIp(req);

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido' });
  }

  try {
    const user = db.prepare('SELECT id, nombre, email FROM usuarios WHERE email = ?').get(email);
    if (!user) {
      return res.status(404).json({ error: 'No existe ninguna cuenta registrada con este correo electrónico' });
    }

    // Generar código numérico de 6 dígitos
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expireTime = new Date(Date.now() + 15 * 60000).toISOString(); // 15 minutos de vigencia

    db.prepare('UPDATE usuarios SET codigo_recuperacion = ?, codigo_expira = ? WHERE id = ?')
      .run(resetCode, expireTime, user.id);

    // Enviar correo real mediante el servicio SMTP
    try {
      await emailService.sendPasswordResetEmail(user.email, user.nombre, resetCode);
    } catch (emailError) {
      console.error('Error al enviar el correo electrónico:', emailError);
      // Registrar en auditoría
      logAudit(user.id, 'Fallo Envío Correo Recuperación', `Error de transporte: ${emailError.message}`, ip);
      return res.status(500).json({
        error: 'No se pudo enviar el correo de verificación. Por favor revisa la configuración del servidor de correo.'
      });
    }

    logAudit(user.id, 'Solicitud de Recuperación de Contraseña', `Código enviado al correo ${email}`, ip);

    res.json({
      message: 'Se ha enviado un código de verificación de 6 dígitos a tu correo electrónico. Revisa tu bandeja de entrada o carpeta de spam.',
      email: user.email
    });
  } catch (error) {
    console.error('Error en forgot-password:', error);
    res.status(500).json({ error: 'Error interno al procesar la solicitud' });
  }
});

/**
 * 7. Restablecimiento de Contraseña con Código de Verificación
 */
router.post('/reset-password', authLimiter, (req, res) => {
  const { email, resetCode, newPassword } = req.body;
  const ip = getClientIp(req);

  if (!email || !resetCode || !newPassword) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const user = db.prepare(`
      SELECT id, nombre, email, codigo_recuperacion, codigo_expira
      FROM usuarios
      WHERE email = ?
    `).get(email);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const now = new Date();

    if (!user.codigo_recuperacion || user.codigo_recuperacion !== resetCode.trim()) {
      logAudit(user.id, 'Fallo Restablecimiento Contraseña', `Código incorrecto ingresado para ${email}`, ip);
      return res.status(400).json({ error: 'El código de verificación es incorrecto' });
    }

    if (!user.codigo_expira || new Date(user.codigo_expira) < now) {
      logAudit(user.id, 'Código de Recuperación Expirado', `Intento con código vencido para ${email}`, ip);
      return res.status(400).json({ error: 'El código de verificación ha expirado. Solicita uno nuevo.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    // Actualizar contraseña y limpiar código temporal + desbloquear cuenta
    db.prepare(`
      UPDATE usuarios
      SET password = ?,
          codigo_recuperacion = NULL,
          codigo_expira = NULL,
          intentos_fallidos = 0,
          bloqueado_hasta = NULL
      WHERE id = ?
    `).run(hashedPassword, user.id);

    // Revocar tokens activos
    revokeAllUserTokens(user.id);

    logAudit(user.id, 'Restablecimiento de Contraseña', `Contraseña restablecida exitosamente para ${email}`, ip);

    res.json({ message: 'Tu contraseña ha sido restablecida exitosamente. Ahora puedes iniciar sesión con tu nueva clave.' });
  } catch (error) {
    console.error('Error en reset-password:', error);
    res.status(500).json({ error: 'Error interno al restablecer la contraseña' });
  }
});

/**
 * 8. Cerrar Sesión (Revocar Refresh Token)
 */
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    revokeRefreshToken(refreshToken);
  }
  res.json({ message: 'Sesión cerrada correctamente' });
});

module.exports = router;
