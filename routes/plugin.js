'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requirePluginAuth } = require('../middleware/pluginAuth');
const { pluginLimiter } = require('../middleware/rateLimiter');
const { broadcast } = require('../services/broadcastService');
const { recordAudit } = require('../services/authService');
const { getDb } = require('../database');
const logger = require('../utils/logger');

// All plugin routes require API key
router.use(requirePluginAuth);
router.use(pluginLimiter);

/**
 * POST /api/plugin/register
 * Plugin announces itself on startup.
 */
router.post('/register', (req, res) => {
  const { serverVersion, motd, maxPlayers, pluginVersion } = req.body || {};

  const db = getDb();
  db.prepare(`
    UPDATE server_status
    SET online = 1, version = ?, motd = ?, max_players = ?, updated_at = unixepoch()
    WHERE id = (SELECT id FROM server_status LIMIT 1)
  `).run(serverVersion || null, motd || null, maxPlayers || 20);

  recordAudit('PLUGIN_REGISTERED', `version=${pluginVersion}`, req.ip);
  logger.info('Plugin registered', { serverVersion, pluginVersion, ip: req.ip });

  broadcast('server_online', { online: true, serverVersion, motd, maxPlayers });
  res.json({ message: 'Registered', ts: Date.now() });
});

/**
 * POST /api/plugin/heartbeat
 * Periodic keepalive from plugin.
 */
router.post('/heartbeat', (req, res) => {
  const { uptime } = req.body || {};

  const db = getDb();
  db.prepare(`
    UPDATE server_status
    SET online = 1, uptime = ?, updated_at = unixepoch()
    WHERE id = (SELECT id FROM server_status LIMIT 1)
  `).run(uptime || 0);

  broadcast('heartbeat', { uptime, ts: Date.now() });
  res.json({ message: 'OK', ts: Date.now() });
});

/**
 * POST /api/plugin/status
 */
router.post('/status', (req, res) => {
  const { online, version, motd, playerCount, maxPlayers, uptime } = req.body || {};

  const db = getDb();
  db.prepare(`
    UPDATE server_status
    SET online = ?, version = ?, motd = ?, player_count = ?, max_players = ?, uptime = ?, updated_at = unixepoch()
    WHERE id = (SELECT id FROM server_status LIMIT 1)
  `).run(
    online ? 1 : 0,
    version || null,
    motd || null,
    playerCount || 0,
    maxPlayers || 20,
    uptime || 0
  );

  broadcast('status', { online, version, motd, playerCount, maxPlayers, uptime });
  res.json({ message: 'OK' });
});

/**
 * POST /api/plugin/performance
 */
router.post('/performance', (req, res) => {
  const { tps, mspt, cpuUsage, ramUsed, ramTotal } = req.body || {};

  const db = getDb();

  db.prepare(`
    INSERT INTO performance (tps, mspt, cpu_usage, ram_used, ram_total)
    VALUES (?, ?, ?, ?, ?)
  `).run(tps || 20, mspt || 0, cpuUsage || 0, ramUsed || 0, ramTotal || 0);

  // Keep only last 1440 rows (24h at 1/min)
  db.prepare(`
    DELETE FROM performance WHERE id NOT IN (
      SELECT id FROM performance ORDER BY recorded_at DESC LIMIT 1440
    )
  `).run();

  broadcast('performance', { tps, mspt, cpuUsage, ramUsed, ramTotal, ts: Date.now() });
  res.json({ message: 'OK' });
});

/**
 * POST /api/plugin/players
 */
router.post('/players', (req, res) => {
  const { players } = req.body || {};

  if (!Array.isArray(players)) {
    return res.status(400).json({ error: 'players must be an array' });
  }

  const db = getDb();

  // Replace current online player list
  db.prepare('DELETE FROM players').run();

  const insert = db.prepare(`
    INSERT INTO players (id, name, uuid, world, health, food_level, game_mode, op, ping)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction((list) => {
    for (const p of list) {
      insert.run(
        uuidv4(),
        p.name || 'Unknown',
        p.uuid || uuidv4(),
        p.world || null,
        p.health != null ? p.health : null,
        p.foodLevel != null ? p.foodLevel : null,
        p.gameMode || null,
        p.op ? 1 : 0,
        p.ping || 0
      );
    }
  });

  insertAll(players);

  // Update player count
  db.prepare(`
    UPDATE server_status SET player_count = ?, updated_at = unixepoch()
    WHERE id = (SELECT id FROM server_status LIMIT 1)
  `).run(players.length);

  broadcast('players', { players, count: players.length });
  res.json({ message: 'OK', count: players.length });
});

/**
 * POST /api/plugin/worlds
 */
router.post('/worlds', (req, res) => {
  const { worlds } = req.body || {};

  if (!Array.isArray(worlds)) {
    return res.status(400).json({ error: 'worlds must be an array' });
  }

  const db = getDb();
  db.prepare('DELETE FROM worlds').run();

  const insert = db.prepare(`
    INSERT INTO worlds (id, name, environment, player_count, chunk_count, entity_count, seed, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction((list) => {
    for (const w of list) {
      insert.run(
        uuidv4(),
        w.name || 'world',
        w.environment || null,
        w.playerCount || 0,
        w.chunkCount || 0,
        w.entityCount || 0,
        w.seed != null ? String(w.seed) : null,
        w.difficulty || null
      );
    }
  });

  insertAll(worlds);

  broadcast('worlds', { worlds });
  res.json({ message: 'OK', count: worlds.length });
});

/**
 * POST /api/plugin/plugins
 */
router.post('/plugins', (req, res) => {
  const { plugins } = req.body || {};

  if (!Array.isArray(plugins)) {
    return res.status(400).json({ error: 'plugins must be an array' });
  }

  const db = getDb();
  db.prepare('DELETE FROM plugins').run();

  const insert = db.prepare(`
    INSERT INTO plugins (id, name, version, enabled, description, authors)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction((list) => {
    for (const p of list) {
      insert.run(
        uuidv4(),
        p.name || 'Unknown',
        p.version || null,
        p.enabled !== false ? 1 : 0,
        p.description || null,
        Array.isArray(p.authors) ? p.authors.join(', ') : (p.authors || null)
      );
    }
  });

  insertAll(plugins);

  broadcast('plugins', { plugins });
  res.json({ message: 'OK', count: plugins.length });
});

module.exports = router;
