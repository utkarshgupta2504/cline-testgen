/**
 * The one place that constructs a Cline SDK Agent.
 *
 * `Agent` is the user-friendly alias for `AgentRuntime` in @cline/sdk. We use the
 * "provider" config form — you give it providerId + modelId (+ baseUrl/apiKey) and
 * the runtime builds the model via @cline/llms. No terminal, no interactive prompt:
 * this is exactly what the CLI could not give us (see the project README / HTML doc).
 *
 * Everything routes through here so that if the SDK surface shifts between versions,
 * there is a single file to update.
 */
import { Agent } from '@cline/sdk';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * @param {object} opts
 * @param {string}  opts.systemPrompt      - system prompt for this agent
 * @param {Array}   [opts.tools=[]]        - createTool() tools (Phase 2+; empty for plain prompts)
 * @param {Function}[opts.onEvent]         - optional extra event listener
 * @param {object}  [opts.log=logger]      - logger (child logger recommended)
 * @param {object}  [opts.overrides={}]    - shallow overrides for the runtime config
 * @returns {import('@cline/sdk').Agent}
 */
export function createAgent({ systemPrompt, tools = [], onEvent, log = logger, overrides = {} } = {}) {
  const runtimeConfig = {
    providerId: config.llm.providerId,
    modelId: config.llm.modelId,
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,

    systemPrompt,
    tools,
    maxIterations: config.agent.maxIterations,

    // Hand the SDK our logger so its internal diagnostics land in the same files.
    logger: log,

    // Headless safety net: auto-approve any tool the agent wants to run. Without a
    // human at a terminal, nothing can answer an approval prompt — so we answer it.
    // (Plain prompt runs register no tools, so this never fires there.)
    requestToolApproval: async (request) => {
      log.debug('auto-approving tool', { tool: request?.toolName ?? request?.name });
      return { approved: true };
    },

    ...overrides,
  };

  log.debug('creating agent', {
    provider: runtimeConfig.providerId,
    model: runtimeConfig.modelId,
    baseUrl: runtimeConfig.baseUrl,
    tools: tools.map((t) => t?.name).filter(Boolean),
    maxIterations: runtimeConfig.maxIterations,
  });

  const agent = new Agent(runtimeConfig);
  if (onEvent) agent.subscribe(onEvent);
  return agent;
}

export default createAgent;
