/**
 * Middleware de Rate Limiting en memoria para protección contra ataques de fuerza bruta y DoS
 */

const ipRequestMap = new Map();

// Limpieza periódica de entradas viejas en memoria cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of ipRequestMap.entries()) {
    if (now > data.resetTime) {
      ipRequestMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Genera un middleware de limitación de tasa configurable
 * @param {number} maxRequests - Número máximo de peticiones permitidas en la ventana
 * @param {number} windowMs - Duración de la ventana de tiempo en milisegundos
 * @param {string} message - Mensaje de error al exceder el límite
 */
function createRateLimiter(maxRequests = 60, windowMs = 60 * 1000, message = 'Demasiadas solicitudes. Por favor, intenta más tarde.') {
  return (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.baseUrl || ''}_${clientIp}`;
    const now = Date.now();

    let record = ipRequestMap.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      ipRequestMap.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: message,
        retryAfter: `${retryAfterSeconds} segundos`
      });
    }

    next();
  };
}

// Limiter para rutas de autenticación (Login, Registro, Recuperación)
const authLimiter = createRateLimiter(
  200, // 200 intentos
  10 * 60 * 1000, // en 10 minutos
  'Has superado el límite de intentos de autenticación. Espera unos minutos antes de reintentar.'
);

// Limiter general para API
const generalLimiter = createRateLimiter(
  200, // 200 peticiones
  60 * 1000, // por minuto
  'Límite de solicitudes por minuto excedido.'
);

module.exports = {
  createRateLimiter,
  authLimiter,
  generalLimiter
};
