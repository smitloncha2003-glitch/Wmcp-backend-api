'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3001', 10),

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-in-production',
    accessExpiresIn: '15m',
    refreshExpiresIn: '7d',
  },

  plugin: {
    apiKey: process.env.PLUGIN_API_KEY || 'change-me-plugin-key',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  database: {
    path: process.env.DATABASE_PATH || './data/wmcp.db',
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },

  loginCode: {
    expiryMs: 10 * 60 * 1000, // 10 minutes
  },
};

module.exports = config;
