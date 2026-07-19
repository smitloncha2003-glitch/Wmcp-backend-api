'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const { initDatabase } = require('./database');
const logger = require('./utils/logger');
const { attachWebSocket } = require('./websocket/handler');
const { defaultLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const pluginRoutes = require('./routes/plugin');
const dashboardRoutes = require('./routes/dashboard');
const aiRoutes = require('./routes/ai');

// ─── Bootstrap ───────────────────────────────────────────────────────────────

initDatabase();

const app = express();

// ─── Security & Middleware ────────────────────────────────────────────────────

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: config.cors.origin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  })
);

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// HTTP request logging via morgan → winston
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (req) => req.path === '/api/healthz',
  })
);

app.use(defaultLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/healthz
 * Public health check — used by Render, load balancers, uptime monitors.
 */
app.get('/api/healthz', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
});

app.use('/api/auth', authRoutes);
app.use('/api/plugin', pluginRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/ai', aiRoutes);

// ─── 404 & Error handlers ─────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = http.createServer(app);
attachWebSocket(server);

const PORT = config.port;
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`WMCP Backend listening`, { port: PORT, env: process.env.NODE_ENV || 'development' });
  logger.info('WebSocket endpoints: ws://<host>/ws  (dashboard)  |  ws://<host>/ws/plugin  (plugin)');
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  logger.info(`Received ${signal} — shutting down`);
  server.close(() => {
    const { closeDatabase } = require('./database');
    closeDatabase();
    logger.info('Server closed. Goodbye.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

module.exports = app; // export for testing
