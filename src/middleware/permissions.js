const db = require('../database/db');

/**
 * Obtiene la lista de nombres de permisos asignados a un rol desde la BD
 */
function getUserPermissions(id_rol) {
  const rows = db.prepare(`
    SELECT p.nombre_permiso
    FROM permisos p
    JOIN rol_permisos rp ON p.id = rp.id_permiso
    WHERE rp.id_rol = ?
  `).all(id_rol);

  return rows.map(r => r.nombre_permiso);
}

/**
 * Middleware que valida si el rol del usuario cuenta con un permiso específico
 * de forma dinámica consultando la tabla rol_permisos.
 */
function requirePermission(permissionName) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Acceso no autorizado: Debes iniciar sesión' });
    }

    // Los Administradores tienen acceso global (*) por diseño
    if (req.user.nombre_rol === 'Administrador') {
      return next();
    }

    // Verificación dinámica en la base de datos
    const hasPerm = db.prepare(`
      SELECT 1 FROM rol_permisos rp
      JOIN permisos p ON rp.id_permiso = p.id
      WHERE rp.id_rol = ? AND p.nombre_permiso = ?
    `).get(req.user.id_rol, permissionName);

    if (!hasPerm) {
      return res.status(403).json({
        error: `Acceso denegado: No tienes el permiso requerido ('${permissionName}')`,
        permiso_requerido: permissionName
      });
    }

    next();
  };
}

module.exports = {
  requirePermission,
  getUserPermissions
};
