/**
 * Phase 1c — the HTTP API that Streamlit (Python) will call.
 *
 * Streamlit can't import an npm package, so the SDK lives here in Node and the two
 * talk over localhost HTTP. This exposes:
 *   GET  /health          -> liveness + effective config (no secrets)
 *   POST /run             -> { prompt, systemPrompt? }            (general prompt)
 *   POST /generate-tests  -> { className, javaSource, testSource? } (product path)
 *
 * Kept intentionally thin: it validates input, calls the same runAgent() the CLI uses,
 * and returns JSON. Long runs (Gemma is ~60–70s on CPU) are handled as a single
 * blocking request for the POC — see README "Known limitations" for the streaming/job
 * upgrade path when responses get too slow to hold a socket open.
 */
import express from 'express';
import { runAgent } from '../runners/runAgent.js';
import { TESTGEN_SYSTEM_PROMPT, buildTestGenPrompt } from '../prompts/testgen.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export function createServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' })); // Java files can be chunky

  // Basic request logging.
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, { ip: req.ip });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'cline-testgen',
      provider: config.llm.providerId,
      model: config.llm.modelId,
      baseUrl: config.llm.baseUrl,
      maxIterations: config.agent.maxIterations,
    });
  });

  // General-purpose prompt endpoint (mirrors the CLI custom-prompt path).
  app.post('/run', async (req, res) => {
    const { prompt, systemPrompt } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'body.prompt (string) is required' });
    }
    const result = await runAgent({
      systemPrompt: systemPrompt || TESTGEN_SYSTEM_PROMPT,
      userPrompt: prompt,
    });
    return res.status(result.ok ? 200 : 500).json(result);
  });

  // Product-shaped endpoint: hand it the class + existing test, get tests back.
  app.post('/generate-tests', async (req, res) => {
    const { className, javaSource, testSource = '', extra = '' } = req.body ?? {};
    if (!className || !javaSource) {
      return res.status(400).json({ ok: false, error: 'body.className and body.javaSource are required' });
    }
    const userPrompt = buildTestGenPrompt({ className, javaSource, testSource, extra });
    const result = await runAgent({ systemPrompt: TESTGEN_SYSTEM_PROMPT, userPrompt });
    return res.status(result.ok ? 200 : 500).json(result);
  });

  // JSON 404 + error handler so the Python client always gets parseable output.
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    logger.error('unhandled server error', { error: err?.message });
    res.status(500).json({ ok: false, error: err?.message ?? 'internal error' });
  });

  return app;
}

export function startServer() {
  const app = createServer();
  const { host, port } = config.server;
  return app.listen(port, host, () => {
    logger.info(`=== Phase 1c: HTTP API listening ===`, { url: `http://${host}:${port}` });
    logger.info('endpoints', { get: ['/health'], post: ['/run', '/generate-tests'] });
  });
}

export default startServer;
