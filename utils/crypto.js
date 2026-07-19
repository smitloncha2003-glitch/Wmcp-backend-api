'use strict';

const crypto = require('crypto');

/**
 * Generate a cryptographically secure 6-digit numeric code.
 */
function generateLoginCode() {
  const bytes = crypto.randomBytes(4);
  const value = bytes.readUInt32BE(0);
  return String(value % 1000000).padStart(6, '0');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { generateLoginCode, safeCompare };
