/**
 * Phase 1b runner — run an arbitrary custom prompt passed on the command line.
 *
 *   node src/index.js -- "add missing tests to PaymentService"
 *   npm start -- "explain this stack trace ..."
 *
 * Uses the test-generation system prompt by default (that is the product), but any
 * free-text prompt works — this is the general "send Gemma a custom instruction" path.
 */
import { runAgent } from './runAgent.js';
import { TESTGEN_SYSTEM_PROMPT } from '../prompts/testgen.js';
import { logger } from '../utils/logger.js';

/**
 * @param {string} userPrompt - the free-text prompt
 */
export async function runPrompt(userPrompt) {
  if (!userPrompt || !userPrompt.trim()) {
    logger.error('no prompt provided. Usage: npm start -- "your prompt here"');
    return { ok: false, status: 'error', error: 'empty prompt' };
  }

  logger.info('=== Phase 1b: custom prompt ===', { promptChars: userPrompt.length });
  const result = await runAgent({
    systemPrompt: TESTGEN_SYSTEM_PROMPT,
    userPrompt,
  });

  logger.info(result.ok ? '✔ custom prompt OK' : '✘ custom prompt FAILED', {
    status: result.status,
    durationMs: result.durationMs,
  });
  return result;
}

export default runPrompt;
