"""
The bridge: spawn the Node SDK entry point per call, pipe JSON in, read JSON out.

This is what lets us ship WITHOUT a server. There is no long-running process — each
call runs `node .../sdk-entry.js`, writes the request to stdin, and parses the single
JSON object from stdout. Node boot (~0.5s) is negligible against minutes of inference.

Node itself is still required (the Cline SDK is a Node library). It's supplied either
by `nodejs-wheel-binaries` (a Node 22 build put on PATH by pip) or a system Node 22+.

Where the JS lives (resolved in this order):
  1. $CLINE_JS_DIR                          — explicit override
  2. the repo checkout next to this package — dev / `pip install -e .`
  3. cline_py/js (bundled into the wheel)   — `pip install git+https://…`

When the resolved dir already has node_modules (a dev checkout), we run in place. For
an installed wheel (read-only, no deps), we copy the JS payload to a writable cache dir
(~/.cache/cline_py/<version>/js) and `npm ci` there once.
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
_BUNDLED_JS = _PKG_DIR / "js"          # present in built wheels
_REPO_JS = _PKG_DIR.parent             # dev/editable: repo root with live src/ + package.json


def _version() -> str:
    try:
        from importlib.metadata import version
        return version("cline-py")
    except Exception:  # noqa: BLE001
        return "dev"


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


def _source_js_dir() -> Path:
    """Find the JS project (the dir containing package.json + src/sdk-entry.js)."""
    env = os.environ.get("CLINE_JS_DIR")
    if env:
        return Path(env).resolve()
    if (_REPO_JS / "src" / "sdk-entry.js").exists() and (_REPO_JS / "package.json").exists():
        return _REPO_JS
    if (_BUNDLED_JS / "src" / "sdk-entry.js").exists():
        return _BUNDLED_JS
    raise ClineError(
        "could not locate the JS bridge (sdk-entry.js). Set CLINE_JS_DIR to the Node project root."
    )


def _cache_dir() -> Path:
    base = os.environ.get("CLINE_CACHE_DIR") or (Path.home() / ".cache" / "cline_py")
    return Path(base) / _version() / "js"


def _work_dir(source: Path) -> Path:
    """
    The directory we actually run Node from (must hold package.json + node_modules).

    Dev checkout with deps already installed → use it in place. Otherwise copy the JS
    payload to a writable cache dir and let _ensure_deps() install there once.
    """
    if (source / "node_modules" / "@cline").exists():
        return source
    work = _cache_dir()
    if not (work / "src" / "sdk-entry.js").exists():
        work.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source / "src", work / "src", dirs_exist_ok=True)
        for f in ("package.json", "package-lock.json"):
            if (source / f).exists():
                shutil.copy2(source / f, work / f)
    return work


def _ensure_deps(work: Path) -> None:
    """Lazily install JS dependencies on first use (idempotent — cached by node_modules)."""
    if (work / "node_modules" / "@cline").exists():
        return
    npm = shutil.which("npm")
    if not npm:
        raise ClineError(
            f"npm not found to install JS deps on first run. Provide Node/npm 22+ "
            f"(e.g. `pip install nodejs-wheel-binaries`), or pre-install node_modules in {work}."
        )
    print(f"[cline_py] first run — installing JS dependencies in {work} (one time) …", file=sys.stderr)
    cp = subprocess.run([npm, "ci"], cwd=str(work), capture_output=True, text=True)
    if cp.returncode != 0:  # fall back if no lockfile / mismatch
        cp = subprocess.run([npm, "install"], cwd=str(work), capture_output=True, text=True)
    if cp.returncode != 0:
        raise ClineError("npm install failed:\n" + cp.stderr[-2000:])


def run(request: dict, timeout: float = 900) -> dict:
    """
    Execute one request against the Node SDK bridge and return the parsed result dict.

    `timeout` is generous by default (~15 min) because agentic runs make several model
    calls and Gemma on CPU is ~3 tok/s. Raise it for big classes, lower it for chat.
    """
    node = _resolve_node()
    source = _source_js_dir()
    work = _work_dir(source)
    _ensure_deps(work)

    entry = work / "src" / "sdk-entry.js"
    if not entry.exists():
        raise ClineError(f"sdk-entry.js not found at {entry}.")

    env = {**os.environ, "LOG_STREAM": "stderr"}  # keep stdout a clean JSON channel
    payload = json.dumps(request).encode()
    try:
        cp = subprocess.run(
            [node, str(entry)],
            input=payload,
            capture_output=True,
            cwd=str(work),
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
