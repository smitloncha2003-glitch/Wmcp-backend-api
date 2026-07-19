'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');
const { broadcast } = require('../services/broadcastService');
const logger = require('../utils/logger');

// All dashboard routes require JWT
router.use(requireAuth);

/**
 * GET /api/status
 */
router.get('/status', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM server_status LIMIT 1').get();
  res.json(row || { online: false });
});

/**
 * GET /api/performance
 * Returns latest snapshot + last 60 data points for charting.
 */
router.get('/performance', (req, res) => {
  const db = getDb();
  const latest = db
    .prepare('SELECT * FROM performance ORDER BY recorded_at DESC LIMIT 1')
    .get();
  const history = db
    .prepare('SELECT * FROM performance ORDER BY recorded_at DESC LIMIT 60')
    .all()
    .reverse();

  res.json({ latest: latest || null, history });
});

/**
 * GET /api/players
 */
router.get('/players', (req, res) => {
  const db = getDb();
  const players = db.prepare('SELECT * FROM players ORDER BY name ASC').all();
  res.json({ players, count: players.length });
});

/**
 * GET /api/worlds
 */
router.get('/worlds', (req, res) => {
  const db = getDb();
  const worlds = db.prepare('SELECT * FROM worlds ORDER BY name ASC').all();
  res.json({ worlds });
});

/**
 * GET /api/plugins
 */
router.get('/plugins', (req, res) => {
  const db = getDb();
  const plugins = db.prepare('SELECT * FROM plugins ORDER BY name ASC').all();
  res.json({ plugins });
});

/**
 * GET /api/console
 * Query params: limit (default 100), level
 */
router.get('/console', (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const level = req.query.level;

  let rows;
  if (level) {
    rows = db
      .prepare(
        'SELECT * FROM console_logs WHERE level = ? ORDER BY recorded_at DESC LIMIT ?'
      )
      .all(level.toUpperCase(), limit);
  } else {
    rows = db
      .prepare('SELECT * FROM console_logs ORDER BY recorded_at DESC LIMIT ?')
      .all(limit);
  }

  res.json({ logs: rows.reverse() });
});

/**
 * POST /api/console
 * Send a command to the server (stored as a console log entry and broadcast over WS).
 * The plugin listens on WebSocket for 'console_command' events.
 * Body: { command: "say Hello" }
 */
router.post('/console', (req, res) => {
  const { command } = req.body || {};

  if (!command || typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({ error: 'command is required' });
  }

  const sanitized = command.trim();

  const db = getDb();
  db.prepare(
    'INSERT INTO console_logs (level, message, source) VALUES (?, ?, ?)'
  ).run('CMD', sanitized, 'dashboard');

  broadcast('console_command', { command: sanitized, ts: Date.now() });

  logger.info('Console command dispatched', { command: sanitized, user: req.user?.sub });
  res.json({ message: 'Command dispatched', command: sanitized });
});

/**
 * GET /api/files
 * Returns a directory listing stub (plugin must implement file endpoint on its side).
 * This endpoint proxies the request via WebSocket to the plugin.
 */
router.get('/files', (req, res) => {
  const path = req.query.path || '/';
  broadcast('files_list_request', { path, requestId: uuidv4() });
  res.json({ message: 'Request dispatched via WebSocket', path });
});

/**
 * POST /api/files
 * Dispatch a file write request to the plugin via WebSocket.
 * Body: { path: "/server.properties", content: "..." }
 */
router.post('/files', (req, res) => {
  const { path, content } = req.body || {};

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'path is required' });
  }
  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'content is required' });
  }

  const requestId = uuidv4();
  broadcast('files_write_request', { path, content, requestId });

  logger.info('File write dispatched', { path, user: req.user?.sub });
  res.json({ message: 'Write request dispatched via WebSocket', path, requestId });
});

/**
 * GET /api/audit
 * Returns recent audit log entries.
 */
router.get('/audit', (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit);
  res.json({ logs: rows });
});

module.exports = router;
