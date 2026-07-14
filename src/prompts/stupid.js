/**
 * Phase 1a — the "stupid" prompt.
 *
 * Deliberately trivial. Its only job is to prove the whole chain is alive:
 * Node -> @cline/sdk Agent -> Ollama /v1 -> Gemma -> tokens come back.
 * No tools, no files, no cleverness. If this prints a sentence, the plumbing works.
 */

export const STUPID_SYSTEM_PROMPT =
  'You are a terse assistant. Answer in one or two short sentences. Do not use tools.';

export const STUPID_PROMPT =
  'Say hello, then tell me in one sentence what a JUnit test is.';

export default { STUPID_SYSTEM_PROMPT, STUPID_PROMPT };
