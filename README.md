# cline-testgen

**Phase 1 POC** — drive the [Cline SDK](https://docs.cline.bot/sdk/overview) *headlessly* (no terminal, no interactive prompt) against a local **Ollama + Gemma** model, to generate missing JUnit test cases for a Spring Boot project.

This is the escape hatch from the interactive-CLI dead end: the Cline **CLI** always opens an interactive shell for its `ask_question` tool and can't be flagged headless. The Cline **SDK** is the same agent runtime as a library — you call `agent.run(prompt)` in code, register your own tools, and never touch a terminal.

> Built and verified against `@cline/sdk@0.0.60`, Node 22.

---

## The three deliverables (in order)

| Phase | What | Command |
|------|------|---------|
| **1a — stupid prompt** | Prove the chain is alive (Node → SDK → Ollama → Gemma). | `npm run stupid` |
| **1.5 — tool check** | Prove a **custom tool can be called** from the SDK (the thing the CLI couldn't do headlessly). | `npm run toolcheck` |
| **1b — custom prompt** | Send Gemma any free-text instruction from the CLI. | `npm start -- "add tests to PaymentService"` |
| **1c — HTTP API** | Expose `/run` so the Streamlit (Python) app can call it. | `npm run serve` |

### Phase 1.5 — how the tool check proves itself

It registers a `get_server_info` tool that returns a **secret token generated fresh each run**, then asks the model to call the tool and echo the token. It only passes if **both** the tool was invoked **and** the token appears in the answer — so a lucky guess can't fake it. If the model answers without calling the tool, you'll get a clear diagnostic (try a more tool-capable model). This is the go/no-go gate before building real file/coverage tools.

---

## Quick start

```bash
# 0. prerequisites: Node 22+, and Ollama running with a Gemma model pulled
ollama pull gemma3:12b          # use the tag that matches your setup
ollama list                     # confirm the exact tag

# 1. install
npm install

# 2. configure (optional — defaults target local Ollama)
cp .env.example .env            # then edit CLINE_MODEL_ID if your tag differs

# 3. Phase 1a — smoke test
npm run stupid

# 4. Phase 1b — custom prompt
npm start -- "Explain what a Mockito stub is in one line."

# 5. Phase 1c — the API
npm run serve
# in another shell:
curl -s localhost:8787/health | jq
curl -s -X POST localhost:8787/run \
  -H 'content-type: application/json' \
  -d '{"prompt":"Say hi and name one JUnit assertion."}' | jq
```

> **Note on `--`:** `npm start -- "..."` forwards the quoted prompt to the script. You can also run it directly: `node src/index.js "your prompt"`.

---

## Configuration

All config is env-driven (see [`.env.example`](.env.example)); no module reads `process.env` outside [`src/config`](src/config/index.js).

| Var | Default | Purpose |
|-----|---------|---------|
| `CLINE_PROVIDER_ID` | `ollama` | SDK provider. Use `openai-compatible` for a remote `/v1` endpoint (e.g. the future Gauss API). |
| `CLINE_MODEL_ID` | `gemma3:12b` | Model tag as shown by `ollama list`. **There is no public "Gemma 4" — verify your tag.** |
| `CLINE_BASE_URL` | `http://localhost:11434` | Ollama base URL (the native provider handles `/v1` + `/api`). |
| `CLINE_API_KEY` | `ollama` | Ignored by Ollama; kept non-empty for safety. |
| `CLINE_MAX_ITERATIONS` | `12` | Agent loop cap. |
| `CLINE_API_TIMEOUT_MS` | `180000` | Per model-call timeout. |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | HTTP server bind. |
| `LOG_LEVEL` / `LOG_DIR` / `LOG_PRETTY` | `info` / `logs` / `true` | Logging. |

---

## Project structure

```
cline-testgen/
├── src/
│   ├── index.js              # dispatcher: --stupid | --prompt | --serve
│   ├── config/index.js       # single source of env-driven config
│   ├── agent/createAgent.js  # the ONE place that builds a Cline SDK Agent
│   ├── prompts/
│   │   ├── stupid.js         # Phase 1a trivial prompt
│   │   └── testgen.js        # Phase 1b/1c test-gen system prompt + builder (1:5 ratio)
│   ├── tools/index.js        # Phase 2 scaffold: createTool() file tools (read_java, write_test)
│   ├── runners/
│   │   ├── runAgent.js       # shared "run one prompt to completion" + result shape
│   │   ├── runStupid.js      # Phase 1a
│   │   └── runPrompt.js      # Phase 1b
│   ├── server/server.js      # Phase 1c: /health, /run, /generate-tests
│   └── utils/
│       ├── logger.js         # zero-dep JSON+pretty logger (also a Cline BasicLogger)
│       └── agentEvents.js    # turns the SDK event stream into logs + a transcript
├── .env.example
├── .gitignore
└── package.json
```

**Design intent:** every layer has one responsibility and the SDK surface is touched in exactly one file (`agent/createAgent.js`), so upgrades and Phase 2 (custom tools, file I/O, JaCoCo, validation) are additive, not rewrites.

---

## HTTP API (Phase 1c)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/health` | — | liveness + effective (non-secret) config |
| `POST` | `/run` | `{ prompt, systemPrompt? }` | general prompt result |
| `POST` | `/generate-tests` | `{ className, javaSource, testSource?, extra? }` | product path: builds the 1:5 test-gen prompt for you |

Every response is `{ runId, ok, status, iterations, outputText, toolCalls, usage, durationMs, error? }`.

### Calling it from Streamlit (Python)

```python
import requests
r = requests.post("http://localhost:8787/generate-tests", json={
    "className": "PaymentService",
    "javaSource": java_src,
    "testSource": test_src,
}, timeout=300)
st.code(r.json()["outputText"])
```

---

## The 1 : 5 test ratio

The test-gen system prompt ([`src/prompts/testgen.js`](src/prompts/testgen.js)) instructs the model to produce ~5 negative tests (null args, invalid input, boundaries, exceptions, unauthorized, empty/oversized) for every 1 positive happy-path test — because that is where real bugs live.

---

## Troubleshooting

**`ReferenceError: TransformStream is not defined`** — your Node is too old. `@cline/sdk` needs **Node 22+** (Web Streams globals only exist from Node 18). Check with `node -v`, then:

```bash
nvm install 22 && nvm use 22
rm -rf node_modules package-lock.json && npm install   # rebuild under the new Node
```

The app now version-checks on startup and prints this guidance instead of the raw error. An `.nvmrc` (pinned to `22`) is included, so `nvm use` in the project dir picks the right version automatically.

---

## Known limitations / next steps

- **Latency:** Gemma 12B on CPU is ~60–70 s per response (~3 tok/s). A single blocking `POST /run` is fine for the POC; if it gets too slow to hold a socket, add streaming (SSE) or a job-and-poll pattern. A GPU collapses this to seconds.
- **Phase 2 — custom tools:** [`src/tools/index.js`](src/tools/index.js) already defines `read_java` / `write_test` via `createTool`. Wire them in (`tools: buildTools(projectRoot)`) so the agent reads/writes real project files instead of receiving source inline.
- **Verify for your stack:** the exact Ollama provider fields and the Gemma tag. Defaults are sensible but confirm against `ollama list` and the SDK docs.
- **Production:** swap `CLINE_PROVIDER_ID`/`CLINE_BASE_URL` to the hosted **Gauss API** — one config change, no code change.

---

## License

MIT
