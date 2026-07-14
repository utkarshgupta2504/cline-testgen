/**
 * Turns the Cline SDK's event stream into (a) readable logs and (b) an accumulated
 * transcript you can return over HTTP.
 *
 * `agent.subscribe(listener)` fires an `AgentRuntimeEvent` for every meaningful
 * step: run lifecycle, per-turn model output deltas, tool calls, tool results,
 * token usage, and errors. We log each and stitch the text deltas back into the
 * full assistant message.
 *
 * The known event `type` values (from @cline/shared AgentRuntimeEvent) include:
 *   run-started | turn-started | turn-finished
 *   assistant-text-delta | assistant-reasoning-delta
 *   tool-call | tool-started | tool-finished | tool-result | tool-updated
 *   usage-updated | completed | error
 */

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

    switch (type) {
      case 'run-started':
        log.info('▶ run started', { runId: event.runId });
        break;

      case 'turn-started':
        log.debug('· turn started', { iteration: event.iteration });
        break;

      case 'assistant-text-delta':
      case 'text-delta':
      case 'text':
        text += event.text ?? event.delta ?? '';
        // stream to stdout so a human watching sees tokens arrive live
        process.stdout.write(event.text ?? event.delta ?? '');
        break;

      case 'assistant-reasoning-delta':
      case 'reasoning-delta':
        reasoning += event.text ?? event.delta ?? '';
        break;

      case 'tool-call':
      case 'tool-started': {
        const name = event.toolName ?? event.name ?? event.tool?.name ?? 'tool';
        log.info(`🛠  tool → ${name}`, { input: event.input ?? event.args });
        toolCalls.push({ name, input: event.input ?? event.args, at: new Date().toISOString() });
        break;
      }

      case 'tool-finished':
      case 'tool-result': {
        const name = event.toolName ?? event.name ?? 'tool';
        log.info(`✅ tool ← ${name}`, { ok: event.ok ?? true });
        break;
      }

      case 'usage-updated':
      case 'usage':
        log.debug('📊 usage', event.usage ?? event);
        break;

      case 'completed':
        if (reasoning) log.debug('🧠 reasoning (truncated)', { chars: reasoning.length });
        log.info('■ run completed');
        break;

      case 'error':
        log.error('✗ agent error', { error: event.error?.message ?? String(event.error ?? 'unknown') });
        break;

      default:
        log.debug(`event: ${type}`);
    }
  };

  const collect = () => ({ text: text.trim(), toolCalls, events });

  return { listener, collect };
}

export default makeEventRecorder;
