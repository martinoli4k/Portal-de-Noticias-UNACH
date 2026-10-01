const db = require('../database/db');

/**
 * Registra una acción en la tabla de auditoría
 * @param {number|null} id_usuario - ID del usuario responsable (o null si es anónimo)
 * @param {string} accion - Título o descripción breve de la acción
 * @param {string} detalles - Información contextual o técnica adicional
 * @param {string} ip - Dirección IP del cliente
 */
function logAudit(id_usuario, accion, detalles = '', ip = '127.0.0.1') {
  try {
    const stmt = db.prepare(`
      INSERT INTO auditoria (id_usuario, accion, detalles, ip, fecha_hora)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    stmt.run(id_usuario || null, accion, detalles, ip, now);
  } catch (error) {
    console.error('Error al registrar auditoría:', error.message);
  }
}

/**
 * Middleware para extraer la IP del cliente
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
}

module.exports = {
  logAudit,
  getClientIp
};
