/**
 * Turns the Cline SDK's event stream into (a) readable logs and (b) an accumulated
 * transcript you can return over HTTP.
 *
 * `agent.subscribe(listener)` fires an `AgentRuntimeEvent` for every meaningful
 * step. The real event `type` values + payloads (from @cline/shared
 * AgentRuntimeEvent, verified against the installed version) are:
 *   run-started | run-finished {result} | run-failed {error}
 *   turn-started | turn-finished {toolCallCount}
 *   assistant-text-delta {text, accumulatedText}
 *   assistant-reasoning-delta {text}
 *   assistant-message {message} | message-added {message}
 *   tool-started | tool-updated | tool-finished  — each with `toolCall:{ toolName, input, toolCallId }`
 *   usage-updated {usage} | status-notice
 */
import { consoleStream } from './logger.js';

/**
 * Build a subscriber + a `collect()` accessor.
 * @param {object} log - a logger (child logger recommended, so lines carry the runId)
 * @returns {{ listener: (e:any)=>void, collect: () => { text: string, toolCalls: any[], events: number } }}
 */
export function makeEventRecorder(log) {
  let text = '';
  let reasoning = '';
  const toolCalls = [];
  let events = 0;

  const listener = (event) => {
    events += 1;
    const type = event?.type ?? 'unknown';

    // ── CAPTURE EVERYTHING ──────────────────────────────────────────────
    // Dump the FULL payload of every single event at debug level, no matter its
    // type. This is the ground-truth record of what the runtime actually emits
    // (names + fields), independent of docs or type defs. Bloats logs on purpose;
    // set LOG_LEVEL=info to quiet it once we know what we're dealing with.
    log.debug(`⟐ event #${events}: ${type}`, { event });

    switch (type) {
      case 'run-started':
        log.info('▶ run started', { runId: event.runId });
        break;

      case 'turn-started':
        log.debug('· turn started', { iteration: event.iteration });
        break;

      case 'assistant-text-delta':
        text += event.text ?? '';
        consoleStream().write(event.text ?? ''); // live stream (stdout, or stderr in entry mode)
        break;

      case 'assistant-reasoning-delta':
        reasoning += event.text ?? '';
        break;

      case 'assistant-message':
      case 'message-added':
        // full message snapshots — noisy; keep at debug
        log.debug(`event: ${type}`, { iteration: event.iteration });
        break;

      case 'tool-started': {
        const name = event.toolCall?.toolName ?? 'tool';
        log.info(`🛠  tool → ${name}`, { input: event.toolCall?.input, toolCallId: event.toolCall?.toolCallId });
        toolCalls.push({
          name,
          input: event.toolCall?.input,
          toolCallId: event.toolCall?.toolCallId,
          at: new Date().toISOString(),
        });
        break;
      }

      case 'tool-updated':
        log.debug('· tool updated', { tool: event.toolCall?.toolName });
        break;

      case 'tool-finished': {
        const name = event.toolCall?.toolName ?? 'tool';
        log.info(`✅ tool ← ${name}`);
        break;
      }

      case 'usage-updated':
        log.debug('📊 usage', event.usage ?? {});
        break;

      case 'status-notice':
        log.debug('status', { message: event.message ?? event });
        break;

      case 'turn-finished':
        log.debug('· turn finished', { iteration: event.iteration, toolCallCount: event.toolCallCount });
        break;

      case 'run-finished':
        if (reasoning) log.debug('🧠 reasoning captured', { chars: reasoning.length });
        log.info('■ run finished', { status: event.result?.status, iterations: event.result?.iterations });
        break;

      case 'run-failed':
        log.error('✗ run failed', { error: event.error?.message ?? String(event.error ?? 'unknown') });
        break;

      default:
        log.debug(`event: ${type}`);
    }
  };

  const collect = () => ({ text: text.trim(), toolCalls, events });

  return { listener, collect };
}

export default makeEventRecorder;
