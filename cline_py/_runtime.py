"""
The bridge: spawn the Node SDK entry point per call, pipe JSON in, read JSON out.

This is what lets us ship WITHOUT a server. There is no long-running process — each
call runs `node src/sdk-entry.js`, writes the request to stdin, and parses the single
JSON object from stdout. Node boot (~0.5s) is negligible against minutes of inference.

Node itself is still required (the Cline SDK is a Node library). It's supplied either
by `nodejs-wheel-binaries` (a Node 22 build installed on PATH via pip) or a system
Node 22+. On first use, the JS dependencies are installed lazily.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

_MIN_NODE_MAJOR = 22

_PKG_DIR = Path(__file__).resolve().parent
# The Node project (package.json + src/sdk-entry.js). Defaults to the repo root that
# contains this package; override with CLINE_JS_DIR when installed elsewhere.
_JS_DIR = Path(os.environ.get("CLINE_JS_DIR", str(_PKG_DIR.parent))).resolve()
_ENTRY = _JS_DIR / "src" / "sdk-entry.js"


class ClineError(RuntimeError):
    """Raised when the Node bridge cannot run or returns something unparseable."""


def _resolve_node() -> str:
    """Locate a Node 22+ binary. `pip install nodejs-wheel-binaries` puts one on PATH."""
    node = os.environ.get("CLINE_NODE") or shutil.which("node")
    if not node:
        raise ClineError(
            "Node.js not found. Install Node 22+, or add `nodejs-wheel-binaries` "
            "(bundles a Node 22 build) to your environment."
        )
    try:
        ver = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=15).stdout.strip()
        major = int(ver.lstrip("v").split(".")[0])
    except Exception as e:  # noqa: BLE001
        raise ClineError(f"could not run node ({node}): {e}") from e
    if major < _MIN_NODE_MAJOR:
        raise ClineError(
            f"Node {ver} is too old; need Node {_MIN_NODE_MAJOR}+. "
            "`pip install nodejs-wheel-binaries` bundles a suitable one."
        )
    return node


def _ensure_deps() -> None:
    """Lazily install JS dependencies on first use (idempotent, cached by node_modules)."""
    if (_JS_DIR / "node_modules" / "@cline").exists():
        return
    npm = shutil.which("npm")
    if not npm:
        raise ClineError(
            f"npm not found to install JS deps on first run. Provide Node/npm 22+, "
            f"or pre-install node_modules in {_JS_DIR}."
        )
    print(f"[cline_py] first run — installing JS dependencies in {_JS_DIR} (one time) …", file=sys.stderr)
    cp = subprocess.run([npm, "ci"], cwd=str(_JS_DIR), capture_output=True, text=True)
    if cp.returncode != 0:  # fall back if no lockfile / mismatch
        cp = subprocess.run([npm, "install"], cwd=str(_JS_DIR), capture_output=True, text=True)
    if cp.returncode != 0:
        raise ClineError("npm install failed:\n" + cp.stderr[-2000:])


def run(request: dict, timeout: float = 900) -> dict:
    """
    Execute one request against the Node SDK bridge and return the parsed result dict.

    `timeout` is generous by default (~15 min) because agentic runs make several model
    calls and Gemma on CPU is ~3 tok/s. Raise it for big classes, lower it for chat.
    """
    node = _resolve_node()
    _ensure_deps()
    if not _ENTRY.exists():
        raise ClineError(f"sdk-entry.js not found at {_ENTRY}. Set CLINE_JS_DIR to the Node project root.")

    env = {**os.environ, "LOG_STREAM": "stderr"}  # keep stdout a clean JSON channel
    payload = json.dumps(request).encode()
    try:
        cp = subprocess.run(
            [node, str(_ENTRY)],
            input=payload,
            capture_output=True,
            cwd=str(_JS_DIR),
            env=env,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as e:
        raise ClineError(f"run timed out after {timeout}s (raise timeout=, or use a faster model/GPU)") from e

    out = cp.stdout.decode(errors="replace").strip()
    if not out:
        tail = cp.stderr.decode(errors="replace")[-2000:]
        raise ClineError(f"no result from sdk-entry (exit {cp.returncode}). stderr tail:\n{tail}")
    try:
        return json.loads(out)
    except json.JSONDecodeError as e:
        raise ClineError(f"could not parse result JSON from sdk-entry:\n{out[:2000]}") from e
