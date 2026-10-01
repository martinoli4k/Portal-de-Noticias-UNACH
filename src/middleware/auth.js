const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_acceso_portal_unach_jwt_2026_segura';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'clave_secreta_refresco_portal_unach_jwt_2026_segura';

const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutos (Requerimiento de seguridad computacional)
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Genera un Access Token de corta duración
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      id_rol: user.id_rol,
      nombre_rol: user.nombre_rol
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Genera y almacena un Refresh Token en base de datos
 */
function generateRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  const expiraEn = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO refresh_tokens (id_usuario, token, expira_en, revocado)
    VALUES (?, ?, ?, 0)
  `).run(userId, token, expiraEn);

  return token;
}

/**
 * Valida un Refresh Token en base de datos
 */
function validateRefreshToken(token) {
  if (!token) return null;

  const record = db.prepare(`
    SELECT rt.id, rt.id_usuario, rt.expira_en, rt.revocado,
           u.id as user_id, u.nombre, u.email, u.id_rol, u.bloqueado_hasta,
           r.nombre_rol
    FROM refresh_tokens rt
    JOIN usuarios u ON rt.id_usuario = u.id
    JOIN roles r ON u.id_rol = r.id
    WHERE rt.token = ? AND rt.revocado = 0
  `).get(token);

  if (!record) return null;

  const now = new Date();
  const expireDate = new Date(record.expira_en);

  if (now > expireDate) {
    // Expirado, marcar como revocado
    db.prepare('UPDATE refresh_tokens SET revocado = 1 WHERE id = ?').run(record.id);
    return null;
  }

  // Verificar que el usuario no esté bloqueado
  if (record.bloqueado_hasta && new Date(record.bloqueado_hasta) > now) {
    return null;
  }

  return {
    id: record.user_id,
    nombre: record.nombre,
    email: record.email,
    id_rol: record.id_rol,
    nombre_rol: record.nombre_rol,
    tokenId: record.id
  };
}

/**
 * Revoca un Refresh Token específico o todos los de un usuario
 */
function revokeRefreshToken(token) {
  if (!token) return;
  db.prepare('UPDATE refresh_tokens SET revocado = 1 WHERE token = ?').run(token);
}

function revokeAllUserTokens(userId) {
  if (!userId) return;
  db.prepare('UPDATE refresh_tokens SET revocado = 1 WHERE id_usuario = ?').run(userId);
}

/**
 * Middleware de autenticación con Access Token
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'El token de acceso ha expirado',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(403).json({ error: 'Token inválido' });
    }

    const user = db.prepare(`
      SELECT u.id, u.nombre, u.email, u.id_rol, u.bloqueado_hasta, r.nombre_rol
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id
      WHERE u.id = ?
    `).get(decoded.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
      return res.status(403).json({ error: 'La cuenta se encuentra temporalmente bloqueada por seguridad' });
    }

    req.user = user;
    next();
  });
}

/**
 * Middleware opcional de autenticación
 */
function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err && decoded) {
      const user = db.prepare(`
        SELECT u.id, u.nombre, u.email, u.id_rol, r.nombre_rol
        FROM usuarios u
        JOIN roles r ON u.id_rol = r.id
        WHERE u.id = ?
      `).get(decoded.id);
      req.user = user || null;
    } else {
      req.user = null;
    }
    next();
  });
}

module.exports = {
  authenticateToken,
  optionalAuthenticateToken,
  generateAccessToken,
  generateRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  JWT_SECRET,
  JWT_REFRESH_SECRET
};
