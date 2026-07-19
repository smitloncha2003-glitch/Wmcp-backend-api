'use strict';

const OpenAI = require('openai');
const config = require('../config');
const logger = require('../utils/logger');

let openaiClient = null;

function getClient() {
  if (!openaiClient) {
    if (!config.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return openaiClient;
}

const SYSTEM_PROMPT = `You are a helpful Minecraft server assistant for WeaponMC Control Panel Pro. 
You assist server administrators with:
- Diagnosing server performance issues (TPS, MSPT, RAM, CPU)
- Explaining Minecraft server concepts and commands
- Troubleshooting plugin conflicts
- Optimizing server configuration
- Understanding console log errors

Be concise, technical, and accurate. Focus on practical Minecraft server administration advice.
Never expose sensitive system information or credentials.`;

/**
 * Send a chat message to OpenAI and return the assistant's reply.
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @returns {Promise<string>} Assistant response text
 */
async function chat(messages) {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    max_tokens: 1024,
    temperature: 0.7,
  });

  const reply = completion.choices[0]?.message?.content || '';
  logger.info('AI chat completion', {
    model: completion.model,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens,
  });

  return reply;
}

module.exports = { chat };
