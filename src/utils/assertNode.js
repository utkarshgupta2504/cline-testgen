/**
 * Fail fast, and clearly, on an unsupported Node version.
 *
 * @cline/sdk requires Node 22+. Its SSE dependency uses Web Streams globals
 * (`TransformStream`, etc.) that only exist from Node 18. On older Node the SDK
 * import chain dies with a cryptic `ReferenceError: TransformStream is not defined`
 * deep inside a dependency — useless for a dev to debug.
 *
 * This module has ZERO imports (so it loads on any Node version) and is called
 * before the SDK is ever imported, turning that cryptic crash into a clear message.
 */

const RECOMMENDED_MAJOR = 22; // matches @cline/sdk "engines"
const HARD_FLOOR_MAJOR = 18; // below this, TransformStream is undefined → guaranteed crash

export function assertNodeVersion() {
  const raw = process.versions.node; // e.g. "16.15.1"
  const major = Number.parseInt(raw.split('.')[0], 10);

  if (major < HARD_FLOOR_MAJOR) {
    // eslint-disable-next-line no-console
    console.error(
      [
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `  ✗ Node ${raw} is too old for @cline/sdk.`,
        '',
        `  The SDK needs Node ${RECOMMENDED_MAJOR}+ (Web Streams globals like`,
        `  TransformStream only exist from Node ${HARD_FLOOR_MAJOR}). On this version you'll`,
        '  hit "ReferenceError: TransformStream is not defined".',
        '',
        '  Fix:  nvm install 22 && nvm use 22',
        '        rm -rf node_modules package-lock.json && npm install',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (major < RECOMMENDED_MAJOR) {
    // eslint-disable-next-line no-console
    console.warn(
      `⚠ Node ${raw} is below the recommended Node ${RECOMMENDED_MAJOR} for @cline/sdk. ` +
        'It may work, but upgrade if you hit odd runtime errors.',
    );
  }
}

export default assertNodeVersion;
