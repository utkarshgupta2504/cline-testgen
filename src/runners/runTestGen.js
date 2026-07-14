/**
 * Phase 2 runner — the real, agentic test generation.
 *
 * Instead of pasting source into the prompt, this hands the agent file TOOLS and
 * points it at real paths in a Spring Boot project. The agent reads the class + its
 * test itself, works out what's uncovered, generates the missing cases (1:5 ratio),
 * and — when `write` is true — writes the updated test file back via write_test.
 *
 * This is the shape the /generate-tests API and the Streamlit UI call.
 */
import path from 'node:path';
import fs from 'node:fs';
import { runAgent } from './runAgent.js';
import { buildTools } from '../tools/index.js';
import { TESTGEN_SYSTEM_PROMPT, buildAgenticTestGenPrompt } from '../prompts/testgen.js';
import { logger } from '../utils/logger.js';

/**
 * @param {object} p
 * @param {string}  p.projectRoot   - absolute path to the Spring Boot project root
 * @param {string}  p.javaPath      - path to the class under test, RELATIVE to projectRoot
 * @param {string} [p.testPath]     - path to the (existing/target) test file, RELATIVE to projectRoot
 * @param {boolean}[p.write=false]  - write the generated test back to disk
 * @param {string} [p.extra='']     - extra instructions for the agent
 */
export async function runTestGen({ projectRoot, javaPath, testPath, write = false, extra = '' }) {
  if (!projectRoot || !javaPath) {
    logger.error('runTestGen requires projectRoot and javaPath');
    return { ok: false, status: 'error', error: 'projectRoot and javaPath are required' };
  }

  const root = path.resolve(projectRoot);
  if (!fs.existsSync(root)) {
    logger.error('projectRoot does not exist', { root });
    return { ok: false, status: 'error', error: `projectRoot not found: ${root}` };
  }

  // Sanity-check the class file exists so we fail fast with a clear message
  // (rather than letting the agent flail on a bad path).
  const javaAbs = path.resolve(root, javaPath);
  if (!javaAbs.startsWith(root) || !fs.existsSync(javaAbs)) {
    logger.error('javaPath not found under projectRoot', { javaAbs });
    return { ok: false, status: 'error', error: `javaPath not found: ${javaPath}` };
  }

  logger.info('=== Phase 2: agentic test generation ===', { projectRoot: root, javaPath, testPath, write });

  const tools = buildTools(root, { write });
  const userPrompt = buildAgenticTestGenPrompt({ javaPath, testPath, write, extra });

  const result = await runAgent({
    systemPrompt: TESTGEN_SYSTEM_PROMPT,
    userPrompt,
    tools,
  });

  const wroteFile = result.toolCalls.some((c) => c.name === 'write_test');
  logger.info(result.ok ? '✔ test generation finished' : '✘ test generation FAILED', {
    status: result.status,
    toolsUsed: result.toolCalls.map((c) => c.name),
    wroteFile,
    durationMs: result.durationMs,
  });

  return { ...result, wroteFile };
}

export default runTestGen;
