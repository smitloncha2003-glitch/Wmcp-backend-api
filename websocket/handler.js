'use strict';

const { WebSocketServer } = require('ws');
const url = require('url');
const { verifyAccessToken, recordAudit } = require('../services/authService');
const { setWss } = require('../services/broadcastService');
const { getDb } = require('../database');
const logger = require('../utils/logger');

const PING_INTERVAL_MS = 30_000;

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Dashboard clients connect at ws://<host>/ws?token=<accessToken>
 * Plugin clients (for command delivery) connect at ws://<host>/ws/plugin?apiKey=<key>
 */
function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  setWss(wss);

  // Handle upgrade negotiation
  httpServer.on('upgrade', (req, socket, head) => {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === '/ws') {
      // Dashboard client — authenticate via JWT query param or Authorization header
      const token =
        parsed.query.token ||
        (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');

      if (!token) {
        logger.warn('WS upgrade rejected: missing token', { ip: req.socket.remoteAddress });
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        verifyAccessToken(token);
      } catch (err) {
        logger.warn('WS upgrade rejected: invalid token', {
          ip: req.socket.remoteAddress,
          err: err.message,
        });
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.clientType = 'dashboard';
        ws.authenticated = true;
        wss.emit('connection', ws, req);
      });
    } else if (parsed.pathname === '/ws/plugin') {
      // Plugin client — authenticate via API key query param or header
      const { requirePluginAuth } = require('../middleware/pluginAuth');
      const apiKey =
        parsed.query.apiKey || parsed.query.api_key || req.headers['x-api-key'] || '';

      const config = require('../config');
      const { safeCompare } = require('../utils/crypto');

      if (!apiKey || !safeCompare(apiKey, config.plugin.apiKey)) {
        logger.warn('WS plugin upgrade rejected: invalid key', {
          ip: req.socket.remoteAddress,
        });
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.clientType = 'plugin';
        ws.authenticated = true;
        wss.emit('connection', ws, req);
      });
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  // Connection handler
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    logger.info('WS client connected', { ip, type: ws.clientType });
    recordAudit(`WS_CONNECT_${(ws.clientType || 'unknown').toUpperCase()}`, null, ip);

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'connected',
        data: { message: 'WMCP WebSocket connected', clientType: ws.clientType },
        ts: Date.now(),
      })
    );

    // If this is a dashboard client, send a snapshot of current state
    if (ws.clientType === 'dashboard') {
      sendSnapshot(ws);
    }

    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      handleMessage(ws, raw, ip);
    });

    ws.on('close', (code, reason) => {
      logger.info('WS client disconnected', {
        ip,
        type: ws.clientType,
        code,
        reason: reason.toString(),
      });
    });

    ws.on('error', (err) => {
      logger.error('WS client error', { ip, type: ws.clientType, err: err.message });
    });
  });

  // Keepalive ping
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        logger.info('WS client terminated (ping timeout)');
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(pingInterval));

  logger.info('WebSocket server attached');
  return wss;
}

/**
 * Send a full state snapshot to a newly connected dashboard client.
 */
function sendSnapshot(ws) {
  try {
    const db = getDb();
    const status = db.prepare('SELECT * FROM server_status LIMIT 1').get();
    const perf = db.prepare('SELECT * FROM performance ORDER BY recorded_at DESC LIMIT 1').get();
    const players = db.prepare('SELECT * FROM players ORDER BY name ASC').all();
    const worlds = db.prepare('SELECT * FROM worlds ORDER BY name ASC').all();
    const plugins = db.prepare('SELECT * FROM plugins ORDER BY name ASC').all();
    const consoleLogs = db
      .prepare('SELECT * FROM console_logs ORDER BY recorded_at DESC LIMIT 100')
      .all()
      .reverse();

    ws.send(
      JSON.stringify({
        type: 'snapshot',
        data: { status, performance: perf, players, worlds, plugins, consoleLogs },
        ts: Date.now(),
      })
    );
  } catch (err) {
    logger.error('Failed to send WS snapshot', { err: err.message });
  }
}

/**
 * Handle incoming messages from clients.
 */
function handleMessage(ws, rawData, ip) {
  let msg;
  try {
    msg = JSON.parse(rawData.toString());
  } catch {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid JSON' } }));
    return;
  }

  const { type, data } = msg;

  if (type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
    return;
  }

  // Plugin: forward console output to dashboard clients
  if (ws.clientType === 'plugin' && type === 'console_output') {
    try {
      const db = getDb();
      const line = data?.message || '';
      const level = (data?.level || 'INFO').toUpperCase();

      db.prepare(
        'INSERT INTO console_logs (level, message, source) VALUES (?, ?, ?)'
      ).run(level, line, 'plugin');

      // Keep last 5000 console rows
      db.prepare(
        'DELETE FROM console_logs WHERE id NOT IN (SELECT id FROM console_logs ORDER BY recorded_at DESC LIMIT 5000)'
      ).run();

      // Broadcast to dashboard clients
      broadcastToDashboards(ws._server_wss || require('../services/broadcastService'), {
        type: 'console',
        data: { level, message: line, ts: Date.now() },
      });
    } catch (err) {
      logger.error('Failed to store console output', { err: err.message });
    }
    return;
  }

  // Plugin: file listing response → relay to dashboard
  if (ws.clientType === 'plugin' && type === 'files_list_response') {
    const { broadcast } = require('../services/broadcastService');
    broadcast('files_list_response', data);
    return;
  }

  // Plugin: file write response → relay to dashboard
  if (ws.clientType === 'plugin' && type === 'files_write_response') {
    const { broadcast } = require('../services/broadcastService');
    broadcast('files_write_response', data);
    return;
  }

  logger.debug('WS unhandled message type', { type, clientType: ws.clientType, ip });
}

/**
 * Broadcast a structured message to all authenticated dashboard WebSocket clients.
 */
function broadcastToDashboards(wssInstance, payload) {
  if (!wssInstance || !wssInstance.clients) return;
  const str = JSON.stringify({ ...payload, ts: Date.now() });
  wssInstance.clients.forEach((client) => {
    if (client.readyState === 1 && client.authenticated && client.clientType === 'dashboard') {
      try {
        client.send(str);
      } catch (_) {}
    }
  });
}

module.exports = { attachWebSocket };
