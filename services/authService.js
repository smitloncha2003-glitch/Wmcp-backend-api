'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { getDb } = require('../database');
const { generateLoginCode } = require('../utils/crypto');
const logger = require('../utils/logger');

function createAccessToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessExpiresIn });
}

function createRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret);
}

function generateAndStoreLoginCode(ipAddress) {
  const db = getDb();
  const code = generateLoginCode();
  const id = uuidv4();
  const expiresAt = Date.now() + config.loginCode.expiryMs;

  // Invalidate any existing unused codes
  db.prepare('UPDATE login_codes SET used = 1 WHERE used = 0').run();

  db.prepare(
    'INSERT INTO login_codes (id, code, expires_at, ip_address) VALUES (?, ?, ?, ?)'
  ).run(id, code, expiresAt, ipAddress || null);

  logger.info('Login code generated', { ip: ipAddress });
  return code;
}

function verifyLoginCode(code, ipAddress) {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM login_codes WHERE code = ? AND used = 0 ORDER BY created_at DESC LIMIT 1')
    .get(code);

  if (!row) {
    return { success: false, reason: 'Invalid code' };
  }

  if (Date.now() > row.expires_at) {
    db.prepare('UPDATE login_codes SET used = 1 WHERE id = ?').run(row.id);
    return { success: false, reason: 'Code has expired' };
  }

  // Mark code as used
  db.prepare('UPDATE login_codes SET used = 1 WHERE id = ?').run(row.id);

  const userId = 'owner';
  const accessToken = createAccessToken({ sub: userId, role: 'owner' });
  const refreshToken = createRefreshToken({ sub: userId, role: 'owner' });

  // Store session
  const sessionId = uuidv4();
  const refreshExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.prepare(
    'INSERT INTO sessions (id, user_id, refresh_token, expires_at, ip_address) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, userId, refreshToken, refreshExpiry, ipAddress || null);

  recordAudit('LOGIN_SUCCESS', `Session created: ${sessionId}`, ipAddress);
  logger.info('Owner logged in', { sessionId, ip: ipAddress });

  return { success: true, accessToken, refreshToken, sessionId };
}

function refreshSession(refreshToken, ipAddress) {
  const db = getDb();

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    return { success: false, reason: 'Invalid or expired refresh token' };
  }

  const session = db.prepare('SELECT * FROM sessions WHERE refresh_token = ?').get(refreshToken);
  if (!session) {
    return { success: false, reason: 'Session not found' };
  }

  if (Date.now() > session.expires_at) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    return { success: false, reason: 'Session expired' };
  }

  const newAccessToken = createAccessToken({ sub: payload.sub, role: payload.role });
  return { success: true, accessToken: newAccessToken };
}

function revokeSession(refreshToken) {
  const db = getDb();
  const result = db.prepare('DELETE FROM sessions WHERE refresh_token = ?').run(refreshToken);
  return result.changes > 0;
}

function recordAudit(event, detail, ipAddress, userAgent) {
  try {
    const db = getDb();
    db.prepare(
      'INSERT INTO audit_logs (id, event, detail, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), event, detail || null, ipAddress || null, userAgent || null);
  } catch (err) {
    logger.error('Failed to write audit log', { event, err: err.message });
  }
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateAndStoreLoginCode,
  verifyLoginCode,
  refreshSession,
  revokeSession,
  recordAudit,
};
