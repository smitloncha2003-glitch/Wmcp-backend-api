'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const schema = require('./schema');
const logger = require('../utils/logger');

let db;

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function initDatabase() {
  const dbPath = path.resolve(config.database.path);
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  // Create all tables
  db.exec(schema.CREATE_SESSIONS);
  db.exec(schema.CREATE_LOGIN_CODES);
  db.exec(schema.CREATE_AUDIT_LOGS);
  db.exec(schema.CREATE_SERVER_STATUS);
  db.exec(schema.CREATE_PERFORMANCE);
  db.exec(schema.CREATE_PLAYERS);
  db.exec(schema.CREATE_WORLDS);
  db.exec(schema.CREATE_PLUGINS);
  db.exec(schema.CREATE_CONSOLE_LOGS);

  // Seed initial server_status row if missing
  const existing = db.prepare('SELECT id FROM server_status LIMIT 1').get();
  if (!existing) {
    db.prepare('INSERT INTO server_status (online) VALUES (0)').run();
  }

  logger.info('Database initialized', { path: dbPath });
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

module.exports = { initDatabase, getDb, closeDatabase };
