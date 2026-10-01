const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Inicializar base de datos y migraciones
require('./src/database/db');

const authRoutes = require('./src/routes/auth.routes');
const newsRoutes = require('./src/routes/news.routes');
const adminRoutes = require('./src/routes/admin.routes');
const { generalLimiter } = require('./src/middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;

// Ocultar firma de Express para prevenir divulgación de información
app.disable('x-powered-by');

// Cabeceras de seguridad HTTP
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Configuración de CORS con orígenes permitidos
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir solicitudes sin origin (como aplicaciones locales o tests) o en lista blanca
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error('Acceso no permitido por política CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter general para API
app.use('/api', generalLimiter);

// Rutas de API REST
app.use('/api/auth', authRoutes);
app.use('/api/noticias', newsRoutes);
app.use('/api/admin', adminRoutes);

// Endpoint de verificación de estado
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    servicio: 'Portal de Noticias API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Enrutamiento para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejador global de errores sin fuga de trazas internas
app.use((err, req, res, next) => {
  console.error('[Error de Servidor]:', err.message);
  res.status(500).json({ error: 'Ocurrió un error inesperado al procesar la solicitud' });
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT} (http://localhost:${PORT})`);
  console.log(`Base de datos SQLite activa con esquema RBAC dinámico y auditoría`);
});
