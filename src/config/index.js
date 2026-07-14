/**
 * Centralised, env-driven configuration.
 *
 * Everything the app needs to know about *where the model lives* and *how the
 * agent should behave* is resolved here, in one place, so no other module ever
 * reads `process.env` directly. Override any value via `.env` (see .env.example).
 */
import 'dotenv/config';

/** Read an env var with a fallback, trimming whitespace. */
function str(key, fallback) {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : String(v).trim();
}

/** Read an integer env var with a fallback. */
function int(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

export const config = {
  /**
   * LLM provider wiring.
   *
   * Defaults target a LOCAL Ollama serving Gemma. The Cline SDK ships a native
   * `ollama` provider (family: openai-compatible) that reads `baseUrl` and talks
   * to Ollama's /v1 + /api endpoints for you — so you usually only set the model tag.
   *
   * To point at a different OpenAI-compatible endpoint (e.g. the future Gauss API),
   * flip CLINE_PROVIDER_ID to "openai-compatible" and set CLINE_BASE_URL to `.../v1`.
   */
  llm: {
    providerId: str('CLINE_PROVIDER_ID', 'openai-compatible'),
    // NOTE: verify the exact tag you pulled with `ollama list`. There is no public
    // "Gemma 4"; the 12B tag is typically `gemma3:12b`. Override via CLINE_MODEL_ID.
    modelId: str('CLINE_MODEL_ID', 'gemma4:12b'),
    baseUrl: str('CLINE_BASE_URL', 'http://localhost:11434/v1'),
    // Ollama ignores the API key, but the SDK/provider may require a non-empty string.
    apiKey: str('CLINE_API_KEY', 'ollama'),
  },

  /** Agent runtime guardrails. */
  agent: {
    maxIterations: int('CLINE_MAX_ITERATIONS', 12),
    // How long a single model call may take before it is aborted (ms).
    apiTimeoutMs: int('CLINE_API_TIMEOUT_MS', 180_000),
  },

  /** HTTP server (Phase 1c — the /run API Streamlit will call). */
  server: {
    host: str('HOST', '127.0.0.1'),
    port: int('PORT', 8787),
  },

  /** Logging. */
  log: {
    // Defaulted to `debug` while we're discovering exactly which events the runtime
    // emits (every event's full payload is dumped at debug). Set LOG_LEVEL=info to quiet.
    level: str('LOG_LEVEL', 'debug'), // debug | info | warn | error
    dir: str('LOG_DIR', 'logs'),
    // Pretty console output on by default; set LOG_PRETTY=false for JSON-only.
    pretty: str('LOG_PRETTY', 'true') !== 'false',
  },
};

export default config;
