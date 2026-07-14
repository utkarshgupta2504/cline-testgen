/**
 * Custom tools (Phase 2 scaffold).
 *
 * The whole reason the SDK beats the CLI: WE decide what the agent can do, and the
 * agent calls our code with no interactive prompt. Each pipeline step becomes a tool:
 *   read_java  -> read a source/test file from the Spring Boot project
 *   run_jacoco -> run the coverage tool and return the report
 *   write_test -> write the generated test file back to disk
 *   validate   -> compile / run the new tests
 *
 * Phase 1 uses none of these (source is passed inline in the prompt). They are wired
 * here, behind a flag, so Phase 2 is a small step, not a rewrite. `createTool` accepts
 * either a Zod schema or a raw JSON Schema for `inputSchema`.
 *
 * To enable: build your agent with `tools: buildTools()` in a runner/server handler.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTool } from '@cline/sdk';
import { logger } from '../utils/logger.js';

/**
 * Verification tool (Phase 1.5).
 *
 * Returns live server info that includes a per-run SECRET token the model cannot
 * possibly know. If the model's answer contains that token, the tool provably ran
 * and its result reached the model — that's our proof that SDK tool-calling works
 * end to end (the thing the interactive CLI could not do headlessly).
 *
 * @param {string} token - a secret generated fresh per run by the caller
 * @param {() => void} [onInvoke] - called when execute() actually runs (ground-truth proof)
 */
export function makeServerInfoTool(token, onInvoke) {
  return createTool({
    name: 'get_server_info',
    description:
      'Return live information about the server running this agent, including a one-time verification token. ' +
      'You cannot know these values without calling this tool.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => {
      logger.info('🛠  get_server_info invoked by the agent');
      if (onInvoke) onInvoke();
      return JSON.stringify({
        verificationToken: token,
        nodeVersion: process.version,
        platform: `${os.type()} ${os.release()}`,
        hostname: os.hostname(),
        serverTime: new Date().toISOString(),
      });
    },
  });
}

/**
 * Reads a Java file from the project. Guards against path traversal by resolving
 * against a configurable project root.
 * @param {string} projectRoot - absolute path the agent is allowed to read within
 */
export function makeReadJavaTool(projectRoot) {
  const root = path.resolve(projectRoot);
  return createTool({
    name: 'read_java',
    description: 'Read a Java source or test file from the Spring Boot project, given a path relative to the project root.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the project root' } },
      required: ['path'],
    },
    execute: async ({ path: rel }) => {
      const abs = path.resolve(root, rel);
      if (!abs.startsWith(root)) throw new Error(`Refusing to read outside project root: ${rel}`);
      logger.debug('read_java', { abs });
      return fs.readFile(abs, 'utf8');
    },
  });
}

/**
 * Writes a generated test file back into the project.
 * (Kept separate so you can gate writes behind an explicit opt-in in the server.)
 */
export function makeWriteTestTool(projectRoot) {
  const root = path.resolve(projectRoot);
  return createTool({
    name: 'write_test',
    description: 'Write (create or overwrite) a JUnit test file in the project, given a path relative to the project root and its full contents.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        contents: { type: 'string' },
      },
      required: ['path', 'contents'],
    },
    execute: async ({ path: rel, contents }) => {
      const abs = path.resolve(root, rel);
      if (!abs.startsWith(root)) throw new Error(`Refusing to write outside project root: ${rel}`);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, contents, 'utf8');
      logger.info('write_test wrote file', { abs, bytes: contents.length });
      return `wrote ${rel} (${contents.length} bytes)`;
    },
  });
}

/**
 * Assemble the tool set for a given project root.
 * Extend this as the pipeline grows (run_jacoco, validate_compiles, …).
 */
export function buildTools(projectRoot) {
  if (!projectRoot) return [];
  return [makeReadJavaTool(projectRoot), makeWriteTestTool(projectRoot)];
}

export default buildTools;
