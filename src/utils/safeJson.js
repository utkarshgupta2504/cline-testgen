/**
 * Safe serialization for logging arbitrary objects — especially SDK events, which
 * carry big `snapshot` fields and can contain circular references. Plain
 * JSON.stringify would throw on those; this never does.
 *
 * - circular references -> "[Circular]"
 * - functions           -> "[Function name]"
 * - bigint              -> string
 * - very long strings   -> truncated with a "(+N chars)" marker
 * - very deep objects    -> "[Truncated depth]"
 */
export function safeSerialize(value, { maxStringLen = 12000, maxDepth = 12 } = {}) {
  const seen = new WeakSet();

  const walk = (v, depth) => {
    if (typeof v === 'string') {
      return v.length > maxStringLen ? `${v.slice(0, maxStringLen)}…(+${v.length - maxStringLen} chars)` : v;
    }
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
    if (v === null || typeof v !== 'object') return v;

    if (seen.has(v)) return '[Circular]';
    if (depth > maxDepth) return '[Truncated depth]';
    seen.add(v);

    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };

    const out = {};
    for (const k of Object.keys(v)) {
      try {
        out[k] = walk(v[k], depth + 1);
      } catch {
        out[k] = '[Unserializable]';
      }
    }
    return out;
  };

  return walk(value, 0);
}

export function safeStringify(value, opts) {
  try {
    return JSON.stringify(safeSerialize(value, opts));
  } catch {
    return '"[Unserializable]"';
  }
}

export default safeStringify;
