#!/usr/bin/env node
/**
 * Machine-readable entry point — the bridge the Python wrapper (cline_py) drives.
 *
 * Contract:
 *   • Reads ONE JSON request object from stdin.
 *   • Writes EXACTLY ONE JSON result object to stdout (nothing else).
 *   • All logs/events go to stderr (LOG_STREAM=stderr), so stdout stays clean.
 *
 * Request: { "action": "generate_tests" | "run_prompt" | "tool_check" | "config", ...params }
 * Result:  the normalized runner result (see runAgent.js), always JSON.
 *
 * This is why the project needs no long-running server: Python spawns
 * `node sdk-entry.js` per call, pipes JSON in, reads JSON out. Node boot (~0.5s)
 * is negligible next to minutes of model inference.
 */

// Force console/log output to stderr BEFORE anything imports config/logger,
// so stdout carries only the result JSON. (Runners are imported dynamically below.)
process.env.LOG_STREAM = 'stderr';

import { assertNodeVersion } from './utils/assertNode.js';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

/** Write the single result object and nothing else to stdout. */
function emitResult(obj) {
  process.stdout.write(JSON.stringify(obj));
}

async function main() {
  assertNodeVersion();

  const raw = (await readStdin()).trim();
  let req;
  try {
    req = raw ? JSON.parse(raw) : {};
  } catch (e) {
    emitResult({ ok: false, status: 'error', error: `invalid JSON on stdin: ${e.message}` });
    process.exit(1);
  }

  const action = req.action || 'run_prompt';
  try {
    let result;
    switch (action) {
      case 'generate_tests': {
        const { runTestGen } = await import('./runners/runTestGen.js');
        result = await runTestGen({
          projectRoot: req.projectRoot,
          javaPath: req.javaPath,
          testPath: req.testPath,
          write: Boolean(req.write),
          extra: req.extra ?? '',
        });
        break;
      }
      case 'run_prompt': {
        const { runPrompt } = await import('./runners/runPrompt.js');
        result = await runPrompt(req.prompt);
        break;
      }
      case 'tool_check': {
        const { runToolCheck } = await import('./runners/runToolCheck.js');
        result = await runToolCheck();
        break;
      }
      case 'config':
      case 'health': {
        const { config } = await import('./config/index.js');
        result = {
          ok: true,
          provider: config.llm.providerId,
          model: config.llm.modelId,
          baseUrl: config.llm.baseUrl,
          maxIterations: config.agent.maxIterations,
          node: process.version,
        };
        break;
      }
      default:
        result = { ok: false, status: 'error', error: `unknown action: ${action}` };
    }

    emitResult(result);
    process.exit(result && result.ok === false ? 1 : 0);
  } catch (e) {
    emitResult({ ok: false, status: 'error', error: e?.message ?? String(e) });
    process.exit(1);
  }
}

main();
