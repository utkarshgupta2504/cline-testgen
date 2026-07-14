/**
 * Phase 1b — the real test-generation prompt.
 *
 * This is where the product intent lives: read a Java class + its existing test,
 * find untested behaviour, and generate the MISSING JUnit cases, weighted heavily
 * toward negative/edge cases (the agreed 1 positive : 5 negative ratio).
 *
 * For Phase 1 the Java/test source is passed inline in the prompt (no file tools
 * yet). Phase 2 replaces the inline source with createTool()-based file reads —
 * see src/tools/index.js.
 */

export const TESTGEN_SYSTEM_PROMPT = [
  'You are a senior Java/Spring Boot test engineer.',
  'You write correct, compilable JUnit 5 (Jupiter) tests using Mockito where appropriate.',
  'You maximise meaningful code coverage: every branch, exception path, and boundary.',
  '',
  'HARD RULE — test ratio: for every 1 positive (happy-path) test, produce ~5 negative',
  'tests (null args, invalid input, boundary values, thrown exceptions, unauthorized',
  'access, empty/oversized data). Negative cases are where real bugs hide.',
  '',
  'Only ADD tests that are missing. Do not duplicate cases already present.',
  'Return a complete, drop-in test class (or the new @Test methods) and nothing else.',
].join('\n');

/**
 * Build a test-generation prompt from inline source.
 * @param {object} p
 * @param {string} p.className       - e.g. "PaymentService"
 * @param {string} p.javaSource      - contents of the Java class under test
 * @param {string} [p.testSource=''] - contents of the existing test file (may be empty)
 * @param {string} [p.extra='']      - any extra instructions from the caller
 * @returns {string}
 */
export function buildTestGenPrompt({ className, javaSource, testSource = '', extra = '' }) {
  return [
    `Add the missing JUnit 5 test cases for the class \`${className}\`.`,
    'Follow the 1 positive : 5 negative ratio.',
    extra ? `\nAdditional instructions: ${extra}` : '',
    '',
    '=== CLASS UNDER TEST ===',
    '```java',
    javaSource,
    '```',
    '',
    '=== EXISTING TEST FILE ===',
    testSource ? '```java' : '(none yet — generate a fresh test class)',
    testSource ? testSource : '',
    testSource ? '```' : '',
    '',
    'List the uncovered behaviours you found, then output the new/updated test code.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export default { TESTGEN_SYSTEM_PROMPT, buildTestGenPrompt };
