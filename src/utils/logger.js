/**
 * Zero-dependency structured logger.
 *
 * - Writes newline-delimited JSON to `logs/app-YYYY-MM-DD.log` (machine-readable,
 *   grep/jq-friendly, ready to ship to any log aggregator later).
 * - Mirrors a pretty, coloured line to the console for humans.
 * - Satisfies the Cline SDK `BasicLogger` interface ({ debug, log, error }), so the
 *   same instance can be handed straight to the Agent for its internal logging.
 *
 * Kept dependency-free on purpose: one less thing to break in a POC. Swap for
 * pino/winston later without touching call sites — the API is intentionally small.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { safeStringify } from './safeJson.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const COLORS = {
  debug: '\x1b[90m', // grey
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m',
  dim: '\x1b[2m',
};

const threshold = LEVELS[config.log.level] ?? LEVELS.info;

// Where human/console log lines go. In the Python-wrapper (sdk-entry) path this is
// stderr, so stdout stays a single clean JSON result. Default: stdout.
const CONSOLE = config.log.stream === 'stderr' ? process.stderr : process.stdout;

/** The stream console output is routed to (stdout or stderr). Used for live token streaming. */
export const consoleStream = () => CONSOLE;

// Resolve + ensure the log directory exists once at startup.
const logDir = path.resolve(process.cwd(), config.log.dir);
fs.mkdirSync(logDir, { recursive: true });

function logFilePath() {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(logDir, `app-${day}.log`);
}

// Append-mode stream, recreated lazily if the day rolls over.
let currentDay = new Date().toISOString().slice(0, 10);
let stream = fs.createWriteStream(logFilePath(), { flags: 'a' });

function streamForToday() {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== currentDay) {
    currentDay = day;
    stream.end();
    stream = fs.createWriteStream(logFilePath(), { flags: 'a' });
  }
  return stream;
}

function emit(level, message, meta) {
  if ((LEVELS[level] ?? LEVELS.info) < threshold) return;

  const time = new Date().toISOString();
  const record = { time, level, message, ...(meta ? { meta } : {}) };

  // 1) durable JSON line (safeStringify so circular/huge event payloads never crash logging)
  streamForToday().write(`${safeStringify(record)}\n`);

  // 2) human console line (to the configured stream — stdout or stderr)
  if (config.log.pretty) {
    const c = COLORS[level] ?? '';
    const metaStr = meta && Object.keys(meta).length ? ` ${COLORS.dim}${safeStringify(meta)}${COLORS.reset}` : '';
    CONSOLE.write(`${COLORS.dim}${time}${COLORS.reset} ${c}${level.toUpperCase().padEnd(5)}${COLORS.reset} ${message}${metaStr}\n`);
  } else {
    CONSOLE.write(`${safeStringify(record)}\n`);
  }
}

export const logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),

  // --- Cline SDK BasicLogger compatibility -------------------------------
  // The SDK calls `.log()` for operational messages and `.debug()`/`.error()`.
  log: (msg, meta) => emit('info', msg, meta),

  /** Create a child logger that stamps every line with fixed context (e.g. a runId). */
  child(context) {
    const merge = (meta) => ({ ...context, ...(meta || {}) });
    return {
      debug: (m, meta) => emit('debug', m, merge(meta)),
      info: (m, meta) => emit('info', m, merge(meta)),
      warn: (m, meta) => emit('warn', m, merge(meta)),
      error: (m, meta) => emit('error', m, merge(meta)),
      log: (m, meta) => emit('info', m, merge(meta)),
      child: (more) => logger.child({ ...context, ...more }),
    };
  },
};

export default logger;
