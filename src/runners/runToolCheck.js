/**
 * Phase 1.5 runner — prove that a custom tool can be called from the SDK.
 *
 * This is the make-or-break validation for the whole pivot: the interactive CLI
 * could not run a tool headlessly. If this passes, the SDK path is confirmed and
 * Phase 2 (real read_java / write_test / jacoco tools) is just more of the same.
 *
 * How it verifies (deterministically, no eyeballing):
 *   1. generate a random secret token in JS,
 *   2. register a `get_server_info` tool that returns that token,
 *   3. ask the model to call the tool and echo the token back,
 *   4. PASS only if BOTH: the tool was invoked AND the token appears in the answer.
 */
import { randomUUID } from 'node:crypto';
import { runAgent } from './runAgent.js';
import { makeServerInfoTool } from '../tools/index.js';
import { TOOLCHECK_SYSTEM_PROMPT, TOOLCHECK_PROMPT } from '../prompts/toolcheck.js';
import { logger } from '../utils/logger.js';

export async function runToolCheck() {
  // Fresh secret per run → the model cannot have memorised it.
  const token = `CLINE-${randomUUID().slice(0, 8).toUpperCase()}`;
  const tool = makeServerInfoTool(token);

  logger.info('=== Phase 1.5: tool-call verification ===', { expectedToken: token });

  const result = await runAgent({
    systemPrompt: TOOLCHECK_SYSTEM_PROMPT,
    userPrompt: TOOLCHECK_PROMPT,
    tools: [tool],
  });

  const calledTool = result.toolCalls.some((c) => c.name === 'get_server_info');
  const echoedToken = result.outputText.includes(token);
  const pass = result.ok && calledTool && echoedToken;

  logger.info(pass ? '✔ TOOL CALL VERIFIED — the SDK invoked our tool' : '✘ tool-call verification FAILED', {
    status: result.status,
    toolWasCalled: calledTool,
    tokenEchoedBack: echoedToken,
    toolCalls: result.toolCalls.map((c) => c.name),
    durationMs: result.durationMs,
  });

  if (!pass) {
    if (!calledTool) {
      logger.warn('The model answered WITHOUT calling the tool. Either the model ignored the instruction ' +
        '(try a more capable model) or tool-calling is not wired through this provider/model.');
    } else if (!echoedToken) {
      logger.warn('The tool was called but the token was not echoed back — the result may not be reaching the model. ' +
        'Check the tool result plumbing for this provider.');
    }
  }

  return { ...result, pass, calledTool, echoedToken, expectedToken: token };
}

export default runToolCheck;
