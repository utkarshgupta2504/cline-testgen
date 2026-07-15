# cline-testgen

**Automatically generate the missing JUnit tests for a Spring Boot class** — an LLM agent reads a Java class and its existing test, works out what isn't covered, and writes the missing cases (weighted heavily to negative/edge cases). The model is **Gemma 12B** running locally via **Ollama**, driven by the **[Cline SDK](https://docs.cline.bot/sdk/overview)**.

There are **two ways to use it**:

1. **`cline_py` — a Python package with no server.** `pip install`, `import cline_py`, call a function. Ideal for a Streamlit/Python app. *(This is the recommended path.)*
2. **A Node CLI + HTTP server.** Run phases from the terminal or expose an HTTP API.

> Built and verified against `@cline/sdk@0.0.60` on Node 22.

---

## Contents

- [Why this exists (30-second version)](#why-this-exists)
- [Quick start (Python)](#quick-start-python)
- [Installation](#installation)
- [Python API reference (`cline_py`)](#python-api-reference-cline_py)
- [Streamlit example](#streamlit-example)
- [How it works under the hood](#how-it-works-under-the-hood)
- [Configuration](#configuration)
- [The Node side (CLI + HTTP API)](#the-node-side-cli--http-api)
- [The 1 : 5 test ratio](#the-1--5-test-ratio)
- [Model &amp; performance](#model--performance)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## Why this exists

Tests rot: new methods and branches ship without tests, coverage silently drops, bugs escape, and writing the missing cases by hand is tedious. This automates it.

The interesting part is *how*. We first tried to drive the **Cline CLI** from Python, but the CLI's `ask_question` tool always opens an **interactive terminal** and no flag makes it headless — a dead end. The fix was to drop a layer and use the **Cline SDK** (the same agent runtime, but a Node *library* with no terminal). Then, because the SDK is Node and our UI is Python, `cline_py` drives that SDK **without any server** — it spawns Node per call and exchanges JSON.

```
  Streamlit / your Python code
            │  import cline_py
            ▼
       cline_py  ──spawns per call──►  node sdk-entry.js  ─►  @cline/sdk (Agent)
            ▲                                                      │
            └────────────── JSON result ◄──────────────────┐      ├─► tools: read_java / write_test  ─► your .java files
                                                           │      └─► Ollama (OpenAI-compatible) ─► Gemma 12B
                                                     (no server, no port)
```

---

## Quick start (Python)

```bash
# 1. Prerequisite: Ollama running with a Gemma model pulled
ollama pull gemma3:12b            # use the tag that matches your setup
ollama list                       # confirm the exact tag

# 2. Install straight from GitHub (pulls a bundled Node 22 too — see Installation)
pip install "git+https://github.com/utkarshgupta2504/cline-testgen.git"
```

```python
import cline_py

# point at your model (optional — defaults shown)
import os
os.environ["CLINE_MODEL_ID"] = "gemma3:12b"     # your `ollama list` tag

# fast reachability check (no generation)
print(cline_py.config())
# -> {'ok': True, 'provider': 'ollama', 'model': 'gemma3:12b', 'node': 'v22.20.0', ...}

# generate the missing tests for a class
result = cline_py.generate_tests(
    project_root="/path/to/your/springboot-project",
    java_path="src/main/java/com/example/PaymentService.java",   # relative to project_root
    test_path="src/test/java/com/example/PaymentServiceTest.java",
    write=False,        # True to save the tests back to disk
    timeout=900,        # ~15 min; agentic runs are minutes on CPU
)
print(result["outputText"])       # the generated JUnit code
```

> **First call is slower**: on first use `cline_py` installs the JS dependencies once (into a cache dir). Every call after that skips straight to running.

---

## Installation

### From GitHub (recommended)

```bash
pip install "git+https://github.com/utkarshgupta2504/cline-testgen.git"
```

This installs the `cline_py` package **and** `nodejs-wheel-binaries` (a **Node 22** build placed on your environment's `PATH`). So a single `pip install` gives you a working runtime — **no separate Node installation needed**.

> Why a Node dependency at all? The Cline SDK is a Node library; there's no pure-Python equivalent. `cline_py` runs it for you under the hood. (`nodejs-bin` was considered but tops out at Node 18, too old for the SDK — hence `nodejs-wheel-binaries`, which ships Node 22.)

### For a Streamlit app

```bash
pip install "git+https://github.com/utkarshgupta2504/cline-testgen.git#egg=cline-py[streamlit]"
```

### From source (development)

```bash
git clone https://github.com/utkarshgupta2504/cline-testgen.git
cd cline-testgen
npm install                 # install JS deps once (dev mode runs from ./src directly)
pip install -e .            # editable install of cline_py
```

In a dev checkout, `cline_py` uses the repo's live `src/` and `node_modules` directly (no copy, no re-install).

### Prerequisites

- **Ollama** running locally with a Gemma model pulled (`ollama pull gemma3:12b`). This is the only thing you install yourself besides `pip`.
- **Python 3.9+**.
- **Node 22+** — supplied automatically by the `nodejs-wheel-binaries` dependency, or use a system Node 22+.

---

## Python API reference (`cline_py`)

Every function spawns Node under the hood, blocks until the run completes, and returns a **normalized result dict**. Errors in setup (Node missing, bad JSON, timeout) raise `cline_py.ClineError`; errors in a run come back as `{"ok": false, "error": ...}`.

### The result dict

```python
{
  "runId": "…",             # UUID, stamped on every log line for this run
  "ok": True,               # success boolean
  "status": "completed",    # SDK status: completed | error | …
  "iterations": 3,          # how many agent loop turns
  "outputText": "…",        # the answer / generated tests
  "toolCalls": [{"name": "read_java", "input": {...}}, …],   # which tools ran
  "usage": {"inputTokens": …, "outputTokens": …},
  "durationMs": 247310,
  "wroteFile": False,       # (generate_tests only) did write_test fire
}
```

### `cline_py.config(timeout=60) -> dict`

Fast reachability/health check — returns the effective provider, model, base URL, and Node version. No model generation. Use it to confirm your setup before a long run.

### `cline_py.generate_tests(project_root, java_path, test_path=None, write=False, extra="", timeout=900) -> dict`

The main entry point. The agent reads the class (and existing test) via the `read_java` tool, identifies uncovered behaviour, generates the missing JUnit 5 cases following the **1 : 5 positive:negative** ratio, and — when `write=True` — writes the updated test file back via the `write_test` tool.

| Param | Type | Notes |
|-------|------|-------|
| `project_root` | str / path | Absolute path to the Spring Boot project root. |
| `java_path` | str | Path to the class under test, **relative to `project_root`**. |
| `test_path` | str | Path to the (existing/target) test file, relative to `project_root`. |
| `write` | bool | `False` = dry run (tests in `outputText`, disk untouched). `True` = overwrite the test file. |
| `extra` | str | Extra free-text instructions for the agent. |
| `timeout` | float | Seconds before the run is aborted. Default ~15 min. |

```python
result = cline_py.generate_tests(
    project_root="examples/springboot-sample",
    java_path="src/main/java/com/example/demo/Calculator.java",
    test_path="src/test/java/com/example/demo/CalculatorTest.java",
    write=True,
)
print("wrote file:", result["wroteFile"], "in", result["durationMs"] / 1000, "s")
```

### `cline_py.run_prompt(prompt, timeout=900) -> dict`

Send any free-text prompt to the model (uses the test-gen system prompt). Handy for ad-hoc questions or debugging the model connection.

### `cline_py.tool_check(timeout=300) -> dict`

Runs the tool-call self-test: registers a tool that returns a secret token, asks the model to call it and echo the token, and verifies **both** that the tool executed **and** the token came back. A quick way to confirm your model can do headless tool-calling. Adds `pass`, `calledTool`, `echoedToken` to the result.

### `cline_py.ClineError`

Raised for setup/transport failures (Node not found, wrong Node version, JSON parse error, timeout). Run failures are returned in the dict (`ok=False`), not raised.

---

## Streamlit example

A ready-to-run, **server-less** UI lives at [`examples/streamlit_app.py`](examples/streamlit_app.py):

```bash
pip install -e ".[streamlit]"        # or install streamlit separately
streamlit run examples/streamlit_app.py
```

The whole integration is just `import cline_py` and calling `generate_tests(...)` inside a spinner — no `requests`, no server, no port.

---

## How it works under the hood

`cline_py` is a thin wrapper; the intelligence is the Node SDK. The design goal was **"no server"**, achieved with a per-call subprocess:

1. **The bridge — `src/sdk-entry.js`.** Reads one JSON request on **stdin**, dispatches to the right runner, and writes **exactly one JSON result to stdout**. All logs and events go to **stderr**, so stdout stays a clean data channel.
2. **Per-call spawn.** `cline_py.run()` locates a Node binary, spawns `node sdk-entry.js`, pipes the request in, and parses the result out. Node boot (~0.5s) is negligible next to minutes of inference, so a fresh process per call is simpler than managing a long-running server.
3. **Node resolution order.** `$CLINE_NODE` → the `node` on `PATH` (the one `nodejs-wheel-binaries` installs). It verifies the version is ≥ 22 and errors clearly otherwise.
4. **JS location order.** `$CLINE_JS_DIR` → the repo checkout (dev/editable) → the copy bundled inside the installed package (`cline_py/js/`, produced at build time).
5. **Lazy dependency install.** If `node_modules` isn't present (a fresh install), the JS payload is copied to a writable cache (`~/.cache/cline_py/<version>/js`) and `npm ci` runs there **once**. Subsequent calls reuse it.

Because the SDK runtime is touched in exactly one JS file (`src/agent/createAgent.js`) and env is read in exactly one place (`src/config/index.js`), the whole thing is easy to reason about and upgrade.

---

## Configuration

All configuration is via **environment variables** (set them before calling `cline_py`, e.g. `os.environ[...]` or your shell). The subprocess inherits them.

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLINE_PROVIDER_ID` | `ollama` | SDK provider. Use `openai-compatible` for a remote `/v1` endpoint (e.g. a hosted API). |
| `CLINE_MODEL_ID` | `gemma3:12b` | The model tag, as shown by `ollama list`. **There is no public "Gemma 4"** — verify your tag. |
| `CLINE_BASE_URL` | `http://localhost:11434` | Where the model is served (the `ollama` provider adds `/v1` itself). |
| `CLINE_API_KEY` | `ollama` | Ignored by Ollama; kept non-empty for safety. |
| `CLINE_MAX_ITERATIONS` | `12` | Agent loop cap (enough for read → read → reason → write). |
| `CLINE_API_TIMEOUT_MS` | `180000` | Per model-call timeout inside the SDK. |
| `LOG_LEVEL` | `debug` | `debug` dumps every SDK event's full payload; set `info` to quiet. |
| **Python-side** | | |
| `CLINE_NODE` | — | Force a specific Node binary. |
| `CLINE_JS_DIR` | — | Point at a specific Node project (overrides auto-detection). |
| `CLINE_CACHE_DIR` | `~/.cache/cline_py` | Where the lazy JS install is cached. |

> A repo-root `.env` is honored **only** when running from a dev checkout (the subprocess runs there). For a `pip`-installed package, use real environment variables.

---

## The Node side (CLI + HTTP API)

You don't need this for the Python path, but it's fully usable.

### CLI phases (from the repo)

```bash
npm run stupid                 # smoke test: chat round-trips through the SDK → Ollama → Gemma
npm run toolcheck              # proves a custom tool can be called headless
npm start -- "your prompt"     # send a custom prompt
npm run testgen -- --project <root> --java <rel> --test <rel> --write   # agentic test-gen
npm run serve                  # start the HTTP API
```

### HTTP API (`npm run serve`, default `:8787`)

| Method · Path | Body | Does |
|---|---|---|
| `GET /health` | — | liveness + effective config |
| `POST /run` | `{ prompt, systemPrompt? }` | any free-text prompt |
| `POST /generate-tests` | **agentic:** `{ projectRoot, javaPath, testPath?, write?, extra? }` · **inline:** `{ className, javaSource, testSource? }` | generate the missing tests |

The mode is chosen by which fields you send (paths → agentic). Every response has the same normalized shape as the Python result dict. If your UI is Python, prefer `cline_py` and skip the server.

---

## The 1 : 5 test ratio

For every **1 positive** (happy-path) test, the agent aims for **5 negative** tests — null args, invalid input, boundary values, thrown exceptions, unauthorized access, empty/oversized data — because that's where real bugs hide. It's enforced in the test-gen **system prompt** ([`src/prompts/testgen.js`](src/prompts/testgen.js)), not as a post-filter.

---

## Model &amp; performance

- **Gemma 12B**: ~7.8 GB on disk, needs ~16 GB RAM, runs at ~3 tok/s **on CPU**.
- A single model call is ~60–70 s; an **agentic run makes several calls** (read → reason → write), so it takes **minutes** on CPU. Set a generous `timeout` (the default is ~15 min).
- Speed is a hardware story, not a code one: a **GPU** cuts this to seconds, and swapping `CLINE_PROVIDER_ID`/`CLINE_BASE_URL` to a hosted OpenAI-compatible API offloads it entirely — a config change, no code change.

---

## Project structure

```
cline-testgen/
├── cline_py/                 # Python wrapper — drive the SDK with NO server
│   ├── __init__.py           #   generate_tests(), run_prompt(), tool_check(), config()
│   └── _runtime.py           #   resolves Node, lazy-installs JS deps, spawns sdk-entry.js
├── pyproject.toml · setup.py # package metadata + build hook that bundles the JS into the wheel
├── src/                      # the Node project (the actual agent)
│   ├── sdk-entry.js          #   machine bridge: JSON stdin → JSON stdout
│   ├── index.js              #   CLI dispatcher (stupid | toolcheck | testgen | prompt | serve)
│   ├── config/index.js       #   the ONLY reader of env
│   ├── agent/createAgent.js  #   the ONLY place that constructs a Cline SDK Agent
│   ├── prompts/              #   system prompts + the agentic test-gen prompt builder
│   ├── tools/index.js        #   createTool()s: read_java, write_test (path-guarded)
│   ├── runners/              #   runAgent (shared) + per-phase runners
│   ├── server/server.js      #   the optional HTTP API
│   └── utils/                #   logger, event recorder, safe JSON, Node-version guard
├── examples/
│   ├── springboot-sample/    # runnable Calculator + an under-covered test
│   └── streamlit_app.py      # no-server Streamlit UI importing cline_py
└── .env.example · .nvmrc
```

---

## Troubleshooting

**`ClineError: Node.js not found` / `too old`** — the wrapper needs Node 22+. Normally `nodejs-wheel-binaries` (a pip dependency) provides it; if you're using a system Node, upgrade to 22+ or set `CLINE_NODE` to a 22+ binary.

**`ReferenceError: TransformStream is not defined`** (Node side) — you're on Node < 18. The SDK needs Node 22+ (Web Streams globals). Upgrade Node; the app also prints this guidance on startup.

**First call hangs for a while** — it's the one-time `npm ci` into the cache. Subsequent calls are fast. Needs network once.

**Model errors / `model not found`** — your `CLINE_MODEL_ID` doesn't match a pulled tag. Run `ollama list` and set it correctly. Remember: there's no public "Gemma 4".

**Run times out** — agentic runs are minutes on CPU; raise `timeout=`. For real speed, use a GPU or a hosted API.

---

## Roadmap

- **`run_jacoco`** tool — measure coverage before/after so the lift is provable.
- **`validate_compiles`** tool — compile the generated tests and feed failures back so the agent self-corrects.
- **Streaming** — push tool/token events to the UI live instead of one blocking call.
- **Production model** — swap local Ollama for a hosted OpenAI-compatible API via config.

---

## License

MIT
