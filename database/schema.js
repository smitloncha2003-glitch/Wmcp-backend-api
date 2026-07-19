'use strict';

const CREATE_SESSIONS = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ip_address TEXT,
  user_agent TEXT
)`;

const CREATE_LOGIN_CODES = `
CREATE TABLE IF NOT EXISTS login_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ip_address TEXT
)`;

const CREATE_AUDIT_LOGS = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  detail TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)`;

const CREATE_SERVER_STATUS = `
CREATE TABLE IF NOT EXISTS server_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  online INTEGER NOT NULL DEFAULT 0,
  version TEXT,
  motd TEXT,
  player_count INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL DEFAULT 0,
  uptime INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`;

const CREATE_PERFORMANCE = `
CREATE TABLE IF NOT EXISTS performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tps REAL NOT NULL DEFAULT 20.0,
  mspt REAL NOT NULL DEFAULT 0.0,
  cpu_usage REAL NOT NULL DEFAULT 0.0,
  ram_used INTEGER NOT NULL DEFAULT 0,
  ram_total INTEGER NOT NULL DEFAULT 0,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
)`;

const CREATE_PLAYERS = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  uuid TEXT NOT NULL,
  world TEXT,
  health REAL,
  food_level INTEGER,
  game_mode TEXT,
  op INTEGER NOT NULL DEFAULT 0,
  ping INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`;

const CREATE_WORLDS = `
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  environment TEXT,
  player_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  entity_count INTEGER NOT NULL DEFAULT 0,
  seed TEXT,
  difficulty TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`;

const CREATE_PLUGINS = `
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  authors TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`;

const CREATE_CONSOLE_LOGS = `
CREATE TABLE IF NOT EXISTS console_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL DEFAULT 'INFO',
  message TEXT NOT NULL,
  source TEXT,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
)`;

module.exports = {
  CREATE_SESSIONS,
  CREATE_LOGIN_CODES,
  CREATE_AUDIT_LOGS,
  CREATE_SERVER_STATUS,
  CREATE_PERFORMANCE,
  CREATE_PLAYERS,
  CREATE_WORLDS,
  CREATE_PLUGINS,
  CREATE_CONSOLE_LOGS,
};
