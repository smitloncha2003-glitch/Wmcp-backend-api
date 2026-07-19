'use strict';

const config = require('../config');
const { safeCompare } = require('../utils/crypto');
const { recordAudit } = require('../services/authService');
const logger = require('../utils/logger');

/**
 * Middleware: authenticate Plugin API requests via X-API-Key header.
 */
function requirePluginAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    logger.warn('Plugin request missing API key', { ip: req.ip, path: req.path });
    recordAudit('PLUGIN_AUTH_MISSING', req.path, req.ip);
    return res.status(401).json({ error: 'Missing X-API-Key header' });
  }

  if (!safeCompare(apiKey, config.plugin.apiKey)) {
    logger.warn('Plugin request invalid API key', { ip: req.ip, path: req.path });
    recordAudit('PLUGIN_AUTH_INVALID', req.path, req.ip);
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}

module.exports = { requirePluginAuth };
