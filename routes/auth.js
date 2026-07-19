'use strict';

const express = require('express');
const router = express.Router();
const {
  generateAndStoreLoginCode,
  verifyLoginCode,
  refreshSession,
  revokeSession,
  recordAudit,
} = require('../services/authService');
const { authLimiter } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/auth/login-code
 * Generate a one-time 6-digit login code (returned in response + logged).
 * In production the owner reads this from the server logs or a secure channel.
 */
router.post('/login-code', authLimiter, (req, res) => {
  const code = generateAndStoreLoginCode(req.ip);

  recordAudit('LOGIN_CODE_GENERATED', null, req.ip, req.headers['user-agent']);

  // Return code in body for dev convenience.
  // In production, read it from logs/server.log and remove it from the response.
  logger.info(`LOGIN CODE: ${code}`, { ip: req.ip });
  res.json({ message: 'Login code generated', code });
});

/**
 * POST /api/auth/login
 * Body: { code: "123456" }
 */
router.post('/login', authLimiter, (req, res) => {
  const { code } = req.body || {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code is required' });
  }

  const result = verifyLoginCode(code.trim(), req.ip);

  if (!result.success) {
    recordAudit('LOGIN_FAILED', result.reason, req.ip, req.headers['user-agent']);
    logger.warn('Login failed', { reason: result.reason, ip: req.ip });
    return res.status(401).json({ error: result.reason });
  }

  res.json({
    message: 'Authenticated',
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    sessionId: result.sessionId,
  });
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken: "..." }
 */
router.post('/refresh', authLimiter, (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  const result = refreshSession(refreshToken, req.ip);
  if (!result.success) {
    return res.status(401).json({ error: result.reason });
  }

  res.json({ accessToken: result.accessToken });
});

/**
 * POST /api/auth/logout
 * Body: { refreshToken: "..." }
 */
router.post('/logout', requireAuth, (req, res) => {
  const { refreshToken } = req.body || {};

  if (refreshToken) {
    revokeSession(refreshToken);
  }

  recordAudit('LOGOUT', null, req.ip, req.headers['user-agent']);
  res.json({ message: 'Logged out' });
});

module.exports = router;
