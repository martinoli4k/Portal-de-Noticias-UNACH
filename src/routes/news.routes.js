const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, optionalAuthenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { logAudit, getClientIp } = require('../middleware/audit');
const { sanitizeInput } = require('../middleware/sanitizer');

router.use(sanitizeInput);

// Listar todas las noticias con filtros
router.get('/', optionalAuthenticateToken, (req, res) => {
  const { categoria, search, limit = 50 } = req.query;

  try {
    let query = `
      SELECT n.id, n.titulo, n.contenido, n.categoria, n.imagen_url, n.id_autor,
             n.fecha_creacion, n.fecha_actualizacion,
             u.nombre AS autor_nombre, u.email AS autor_email, r.nombre_rol AS autor_rol
      FROM noticias n
      JOIN usuarios u ON n.id_autor = u.id
      JOIN roles r ON u.id_rol = r.id
      WHERE 1=1
    `;
    const params = [];

    if (categoria && categoria !== 'Todas') {
      query += ' AND n.categoria = ?';
      params.push(categoria);
    }

    if (search) {
      query += ' AND (n.titulo LIKE ? OR n.contenido LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY n.fecha_creacion DESC LIMIT ?';
    params.push(Number(limit));

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error) {
    console.error('Error al listar noticias:', error.message);
    res.status(500).json({ error: 'Error al consultar las noticias' });
  }
});

// Listar categorías con contador
router.get('/categorias', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT categoria, COUNT(*) as total
      FROM noticias
      GROUP BY categoria
      ORDER BY total DESC
    `).all();
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener categorías:', error.message);
    res.status(500).json({ error: 'Error al consultar categorías' });
  }
});

// Obtener detalle de una noticia
router.get('/:id', optionalAuthenticateToken, (req, res) => {
  const { id } = req.params;

  try {
    const item = db.prepare(`
      SELECT n.id, n.titulo, n.contenido, n.categoria, n.imagen_url, n.id_autor,
             n.fecha_creacion, n.fecha_actualizacion,
             u.nombre AS autor_nombre, u.email AS autor_email, r.nombre_rol AS autor_rol
      FROM noticias n
      JOIN usuarios u ON n.id_autor = u.id
      JOIN roles r ON u.id_rol = r.id
      WHERE n.id = ?
    `).get(id);

    if (!item) {
      return res.status(404).json({ error: 'Noticia no encontrada' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error al obtener noticia:', error.message);
    res.status(500).json({ error: 'Error al consultar el detalle de la noticia' });
  }
});

// Crear nueva noticia
router.post('/', authenticateToken, requirePermission('noticias.crear'), (req, res) => {
  const { titulo, contenido, categoria, imagen_url } = req.body;
  const ip = getClientIp(req);

  if (!titulo || !contenido || !categoria) {
    return res.status(400).json({ error: 'Título, contenido y categoría son obligatorios' });
  }

  try {
    const defaultImage = imagen_url && imagen_url.trim() !== ''
      ? imagen_url
      : 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=80';

    const insert = db.prepare(`
      INSERT INTO noticias (titulo, contenido, categoria, imagen_url, id_autor, fecha_creacion)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const result = insert.run(titulo, contenido, categoria, defaultImage, req.user.id, now);
    const newId = Number(result.lastInsertRowid);

    logAudit(req.user.id, `Publicación de Noticia #${newId}`, `Título: "${titulo}" | Categoría: ${categoria}`, ip);

    const created = db.prepare(`
      SELECT n.*, u.nombre AS autor_nombre, r.nombre_rol AS autor_rol
      FROM noticias n
      JOIN usuarios u ON n.id_autor = u.id
      JOIN roles r ON u.id_rol = r.id
      WHERE n.id = ?
    `).get(newId);

    res.status(201).json({
      message: 'Noticia publicada con éxito',
      noticia: created
    });
  } catch (error) {
    console.error('Error al crear noticia:', error.message);
    res.status(500).json({ error: 'Error interno al publicar la noticia' });
  }
});

// Editar noticia
router.put('/:id', authenticateToken, requirePermission('noticias.editar'), (req, res) => {
  const { id } = req.params;
  const { titulo, contenido, categoria, imagen_url } = req.body;
  const ip = getClientIp(req);

  if (!titulo || !contenido || !categoria) {
    return res.status(400).json({ error: 'Título, contenido y categoría son obligatorios' });
  }

  try {
    const existing = db.prepare('SELECT * FROM noticias WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Noticia no encontrada' });
    }

    // Si no es Administrador, validar si es el autor de la noticia
    if (req.user.nombre_rol !== 'Administrador' && existing.id_autor !== req.user.id) {
      return res.status(403).json({ error: 'No tienes autorización para modificar una noticia redactada por otro usuario' });
    }

    const now = new Date().toISOString();
    const finalImage = imagen_url || existing.imagen_url;

    db.prepare(`
      UPDATE noticias
      SET titulo = ?, contenido = ?, categoria = ?, imagen_url = ?, fecha_actualizacion = ?
      WHERE id = ?
    `).run(titulo, contenido, categoria, finalImage, now, id);

    logAudit(req.user.id, `Edición de Noticia #${id}`, `Título: "${titulo}" | Categoría: ${categoria}`, ip);

    const updated = db.prepare(`
      SELECT n.*, u.nombre AS autor_nombre, r.nombre_rol AS autor_rol
      FROM noticias n
      JOIN usuarios u ON n.id_autor = u.id
      JOIN roles r ON u.id_rol = r.id
      WHERE n.id = ?
    `).get(id);

    res.json({
      message: 'Noticia actualizada con éxito',
      noticia: updated
    });
  } catch (error) {
    console.error('Error al editar noticia:', error.message);
    res.status(500).json({ error: 'Error interno al actualizar la noticia' });
  }
});

// Eliminar noticia
router.delete('/:id', authenticateToken, requirePermission('noticias.eliminar'), (req, res) => {
  const { id } = req.params;
  const ip = getClientIp(req);

  try {
    const existing = db.prepare('SELECT * FROM noticias WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Noticia no encontrada' });
    }

    if (req.user.nombre_rol !== 'Administrador' && existing.id_autor !== req.user.id) {
      return res.status(403).json({ error: 'No tienes autorización para eliminar una noticia de otro autor' });
    }

    db.prepare('DELETE FROM noticias WHERE id = ?').run(id);

    logAudit(req.user.id, `Eliminación de Noticia #${id}`, `Título eliminado: "${existing.titulo}"`, ip);

    res.json({
      message: 'Noticia eliminada satisfactoriamente',
      id: Number(id)
    });
  } catch (error) {
    console.error('Error al eliminar noticia:', error.message);
    res.status(500).json({ error: 'Error interno al eliminar la noticia' });
  }
});

module.exports = router;
