'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const { chat } = require('../services/aiService');
const logger = require('../utils/logger');

router.use(requireAuth);
router.use(aiLimiter);

/**
 * POST /api/ai/chat
 * Body: { messages: [{ role: "user", content: "..." }] }
 * Optionally pass conversation history for multi-turn context.
 */
router.post('/chat', async (req, res, next) => {
  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const MAX_MESSAGES = 20;
  const trimmed = messages.slice(-MAX_MESSAGES);

  // Validate each message
  for (const msg of trimmed) {
    if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({ error: 'Each message must have role "user" or "assistant"' });
    }
    if (typeof msg.content !== 'string' || !msg.content.trim()) {
      return res.status(400).json({ error: 'Each message must have non-empty string content' });
    }
  }

  try {
    const reply = await chat(trimmed);
    res.json({ reply });
  } catch (err) {
    if (err.message && err.message.includes('OPENAI_API_KEY')) {
      return res.status(503).json({ error: 'AI service not configured' });
    }
    logger.error('AI chat error', { err: err.message });
    next(err);
  }
});

module.exports = router;
