"""
cline_py — a thin Python wrapper over the Cline SDK (Node), with no server.

Import it, call a function, get a dict back. Under the hood it spawns Node per call
(the Cline SDK is a Node library); from your side it's pure Python.

    import cline_py

    # verify the model is reachable (fast, no generation)
    cline_py.config()

    # generate the missing tests for a class (agent reads + writes the files)
    result = cline_py.generate_tests(
        project_root="examples/springboot-sample",
        java_path="src/main/java/com/example/demo/Calculator.java",
        test_path="src/test/java/com/example/demo/CalculatorTest.java",
        write=False,          # True to save the tests back to disk
    )
    print(result["outputText"])

Every function returns the normalized result dict:
    { runId, ok, status, iterations, outputText, toolCalls[], usage, durationMs, wroteFile? }
"""
from ._runtime import ClineError, run

__all__ = ["config", "run_prompt", "tool_check", "generate_tests", "ClineError"]


def config(timeout: float = 60) -> dict:
    """Return the effective (non-secret) config: provider, model, baseUrl, node version."""
    return run({"action": "config"}, timeout=timeout)


def run_prompt(prompt: str, timeout: float = 900) -> dict:
    """Send any free-text prompt to the model. Returns the normalized result dict."""
    return run({"action": "run_prompt", "prompt": prompt}, timeout=timeout)


def tool_check(timeout: float = 300) -> dict:
    """Run the tool-call self-test (proves the agent can invoke a custom tool headless)."""
    return run({"action": "tool_check"}, timeout=timeout)


def generate_tests(
    project_root,
    java_path: str,
    test_path: str | None = None,
    write: bool = False,
    extra: str = "",
    timeout: float = 900,
) -> dict:
    """
    Agentically generate the missing JUnit tests for a Java class.

    The agent reads the class (and existing test) via tools, generates the missing
    cases (1 positive : 5 negative ratio), and — when `write=True` — writes the
    updated test file back to disk. Paths are relative to `project_root`.
    """
    return run(
        {
            "action": "generate_tests",
            "projectRoot": str(project_root),
            "javaPath": java_path,
            "testPath": test_path,
            "write": bool(write),
            "extra": extra,
        },
        timeout=timeout,
    )
