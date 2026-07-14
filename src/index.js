#!/usr/bin/env node
/**
 * Entry point / dispatcher.
 *
 * The three Phase-1 deliverables, in the agreed order (stupid → custom → api):
 *
 *   npm run stupid                     # 1a: hardcoded trivial prompt (smoke test)
 *   npm run toolcheck                  # 1.5: prove a custom tool can be called
 *   npm start -- "your prompt here"    # 1b: custom prompt from the CLI
 *   npm run testgen -- --project <root> --java <relPath> [--test <relPath>] [--write]   # 2: agentic test-gen
 *   npm run serve                      # 1c: HTTP API for Streamlit (/run, /generate-tests)
 *
 * Flag routing (also usable directly via `node src/index.js ...`):
 *   --serve                  -> start the HTTP server
 *   --stupid                 -> run the stupid prompt
 *   --toolcheck              -> run the tool-call verification
 *   --testgen ...            -> agentic test generation (see flags above)
 *   --prompt "..."  | "..."  -> run a custom prompt (any non-flag args are joined)
 *   (no args)                -> defaults to the stupid prompt
 */
import { assertNodeVersion } from './utils/assertNode.js';
import { logger } from './utils/logger.js';
import { config } from './config/index.js';

// The AI SDK under @cline/sdk prints deprecation/warning lines to stdout (e.g. the
// 'openai-compatible' providerOptions key notice). Quiet them for clean logs unless
// explicitly re-enabled with AI_SDK_LOG_WARNINGS=true. Must run before the SDK loads.
if (process.env.AI_SDK_LOG_WARNINGS !== 'true') {
  globalThis.AI_SDK_LOG_WARNINGS = false;
}

async function main() {
  // Guard BEFORE anything imports @cline/sdk, so a wrong Node version yields a
  // clear message instead of a cryptic "TransformStream is not defined".
  assertNodeVersion();

  const argv = process.argv.slice(2);

  logger.info('cline-testgen starting', {
    node: process.version,
    provider: config.llm.providerId,
    model: config.llm.modelId,
    baseUrl: config.llm.baseUrl,
  });

  // --- Phase 1c: server ---------------------------------------------------
  if (argv.includes('--serve')) {
    const { startServer } = await import('./server/server.js');
    startServer();
    return; // keep the process alive on the listener
  }

  // --- Phase 1a: stupid prompt -------------------------------------------
  if (argv.includes('--stupid')) {
    const { runStupid } = await import('./runners/runStupid.js');
    const r = await runStupid();
    process.exit(r.ok ? 0 : 1);
  }

  // --- Phase 1.5: tool-call verification ---------------------------------
  if (argv.includes('--toolcheck')) {
    const { runToolCheck } = await import('./runners/runToolCheck.js');
    const r = await runToolCheck();
    process.exit(r.pass ? 0 : 1);
  }

  // --- Phase 2: agentic test generation ----------------------------------
  //   node src/index.js --testgen --project <root> --java <relPath> [--test <relPath>] [--write] [--extra "..."]
  if (argv.includes('--testgen')) {
    const flag = (name) => {
      const i = argv.indexOf(name);
      return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
    };
    const opts = {
      projectRoot: flag('--project'),
      javaPath: flag('--java'),
      testPath: flag('--test'),
      write: argv.includes('--write'),
      extra: flag('--extra') ?? '',
    };
    if (!opts.projectRoot || !opts.javaPath) {
      logger.error('usage: npm run testgen -- --project <root> --java <relPath> [--test <relPath>] [--write] [--extra "..."]');
      process.exit(1);
    }
    const { runTestGen } = await import('./runners/runTestGen.js');
    const r = await runTestGen(opts);
    process.exit(r.ok ? 0 : 1);
  }

  // --- Phase 1b: custom prompt -------------------------------------------
  // Everything that isn't a recognised flag becomes the prompt text.
  const promptFlagIdx = argv.indexOf('--prompt');
  const promptArgs =
    promptFlagIdx >= 0
      ? argv.slice(promptFlagIdx + 1)
      : argv.filter((a) => !a.startsWith('--'));
  const userPrompt = promptArgs.join(' ').trim();

  if (userPrompt) {
    const { runPrompt } = await import('./runners/runPrompt.js');
    const r = await runPrompt(userPrompt);
    process.exit(r.ok ? 0 : 1);
  }

  // --- Default: no args -> stupid prompt ---------------------------------
  logger.info('no prompt/flag given → defaulting to the stupid prompt. (Use `npm start -- "text"` for a custom prompt, `npm run serve` for the API.)');
  const { runStupid } = await import('./runners/runStupid.js');
  const r = await runStupid();
  process.exit(r.ok ? 0 : 1);
}

main().catch((err) => {
  logger.error('fatal', { error: err?.message, stack: err?.stack });
  process.exit(1);
});
