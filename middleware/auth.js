'use strict';

const { verifyAccessToken, recordAudit } = require('../services/authService');
const logger = require('../utils/logger');

/**
 * Middleware: require a valid JWT Bearer token.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    recordAudit('AUTH_MISSING_TOKEN', null, req.ip, req.headers['user-agent']);
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    recordAudit('AUTH_INVALID_TOKEN', err.message, req.ip, req.headers['user-agent']);
    logger.warn('Invalid access token', { ip: req.ip, error: err.message });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: require owner role specifically.
 */
function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'owner') {
      recordAudit('AUTH_FORBIDDEN', `role=${req.user?.role}`, req.ip, req.headers['user-agent']);
      return res.status(403).json({ error: 'Forbidden: owner access required' });
    }
    next();
  });
}

module.exports = { requireAuth, requireOwner };
