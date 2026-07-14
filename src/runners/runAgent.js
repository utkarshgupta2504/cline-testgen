/**
 * The shared "run one prompt to completion" routine.
 *
 * Both CLI runners (stupid / custom prompt) and the HTTP server funnel through
 * here, so event logging, timing, error handling, and the result shape are
 * identical everywhere. Given a systemPrompt + userPrompt (+ optional tools), it:
 *   1. builds an Agent,
 *   2. subscribes an event recorder (logs + accumulates the transcript),
 *   3. runs, times, and returns a normalised result.
 */
import { randomUUID } from 'node:crypto';
import { createAgent } from '../agent/createAgent.js';
import { makeEventRecorder } from '../utils/agentEvents.js';
import { logger } from '../utils/logger.js';

/**
 * @param {object} p
 * @param {string} p.systemPrompt
 * @param {string} p.userPrompt
 * @param {Array}  [p.tools=[]]
 * @param {string} [p.runId]
 * @returns {Promise<{ runId:string, ok:boolean, status:string, iterations:number,
 *                     outputText:string, toolCalls:any[], usage:any, durationMs:number,
 *                     error?:string }>}
 */
export async function runAgent({ systemPrompt, userPrompt, tools = [], runId = randomUUID() }) {
  const log = logger.child({ runId });
  const startedAt = Date.now();

  log.info('run requested', { promptChars: userPrompt.length, tools: tools.map((t) => t?.name).filter(Boolean) });

  const { listener, collect } = makeEventRecorder(log);
  const agent = createAgent({ systemPrompt, tools, onEvent: listener, log });

  try {
    const result = await agent.run(userPrompt);
    if (process.stdout.write) process.stdout.write('\n'); // close the live-streamed line
    const durationMs = Date.now() - startedAt;
    const { text, toolCalls, events } = collect();

    // Prefer the SDK's canonical outputText; fall back to our accumulated deltas.
    const outputText = (result?.outputText && result.outputText.trim()) || text;

    log.info('run finished', {
      status: result?.status,
      iterations: result?.iterations,
      events,
      durationMs,
      usage: result?.usage,
    });

    return {
      runId,
      ok: result?.status === 'completed' || result?.status === 'succeeded' || !result?.error,
      status: result?.status ?? 'unknown',
      iterations: result?.iterations ?? 0,
      outputText,
      toolCalls,
      usage: result?.usage ?? null,
      durationMs,
      ...(result?.error ? { error: result.error.message } : {}),
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    log.error('run threw', { error: err?.message, durationMs });
    return {
      runId,
      ok: false,
      status: 'error',
      iterations: 0,
      outputText: '',
      toolCalls: [],
      usage: null,
      durationMs,
      error: err?.message ?? String(err),
    };
  }
}

export default runAgent;
