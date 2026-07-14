/**
 * Phase 1a runner — fire the trivial "stupid" prompt and print the answer.
 * Proves: Node -> SDK -> Ollama -> Gemma round-trips successfully.
 */
import { runAgent } from './runAgent.js';
import { STUPID_SYSTEM_PROMPT, STUPID_PROMPT } from '../prompts/stupid.js';
import { logger } from '../utils/logger.js';

export async function runStupid() {
  logger.info('=== Phase 1a: stupid prompt ===');
  const result = await runAgent({
    systemPrompt: STUPID_SYSTEM_PROMPT,
    userPrompt: STUPID_PROMPT,
  });

  logger.info(result.ok ? '✔ stupid prompt OK' : '✘ stupid prompt FAILED', {
    status: result.status,
    durationMs: result.durationMs,
  });
  return result;
}

export default runStupid;
