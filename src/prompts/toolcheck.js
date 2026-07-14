/**
 * Phase 1.5 — tool-call verification prompt.
 *
 * A "slightly smarter" prompt than the stupid one: it can only be answered
 * correctly by CALLING a tool. We deliberately ask for a value (the verification
 * token) the model has no way to fabricate, so a correct answer proves the tool
 * was actually invoked and its result flowed back into the model.
 */

export const TOOLCHECK_SYSTEM_PROMPT = [
  'You are a server diagnostics assistant with access to a `get_server_info` tool.',
  'When asked about the server, you MUST call `get_server_info` to obtain live values.',
  'Never guess or invent the verification token — it only comes from the tool.',
  'After calling the tool, answer concisely.',
].join('\n');

export const TOOLCHECK_PROMPT = [
  'Call the get_server_info tool, then report the server status.',
  'Reply in exactly this format, on separate lines:',
  'TOKEN=<the verificationToken from the tool>',
  'NODE=<the nodeVersion from the tool>',
  'HOST=<the hostname from the tool>',
].join('\n');

export default { TOOLCHECK_SYSTEM_PROMPT, TOOLCHECK_PROMPT };
