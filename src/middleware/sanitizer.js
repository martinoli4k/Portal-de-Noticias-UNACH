/**
 * Middleware de Sanitización y Validación de Entradas
 * Previene ataques de XSS, inyecciones de código y manipulación de datos.
 */

function sanitizeString(value) {
  if (typeof value !== 'string') return value;

  let sanitized = value.trim();

  // Eliminar etiquetas script, iframe, object, embed y atributos javascript: / on*
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:[^\s"'>]+/gi, '')
    .replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  return sanitized;
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeInput(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
}

/**
 * Validador de formato de correo electrónico
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

/**
 * Validador de robustez de contraseña (mínimo 6 caracteres)
 */
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

module.exports = {
  sanitizeInput,
  sanitizeString,
  isValidEmail,
  isValidPassword
};
