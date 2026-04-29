# CodeRelay — Master Build Plan (`work.md`)

> **Project codename:** `coderelay` (rename freely)
> **Goal:** A CLI orchestrator that wraps Claude Code / Gemini CLI / Cursor / etc., gives them a shared **codebase graph + memory layer + governance**, and dramatically reduces token usage, hallucinations, and re-work.
> **Strategy:** **Fork & integrate** — reuse MIT/Apache-licensed open-source projects for ~60% of the codebase, focus your own coding effort on the differentiators (memory tiers, alignment loop, governance layer).
> **Owner workflow:** Solo developer, working daily, using Claude Code as the implementation agent.
> **Resume rule:** Every new Claude Code session begins by reading `prompt.md` (next task) and `work.md` (state). Tick checkboxes here as work completes.

---

## 0. How to Use This File

1. **Never delete completed sections.** Only tick `[x]` and update the status field.
2. **One phase at a time.** Phases are dependency-ordered.
3. **Each task has an `Acceptance` line** — work is not "done" until that test passes.
4. **At end of every working session**, update `prompt.md` so next session knows what to do.
5. **If a task takes more than 2 days**, split it into sub-tasks here.

---

## 1. Architecture Snapshot

```
┌────────────────────────────────────────────────────────────────────┐
│                      CODERELAY  (your CLI)                         │
│                                                                    │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐     │
│  │ Indexer  │   │  Memory  │   │ Governor │   │ LLM  Router  │     │
│  │ (TS+AST) │   │ (3-tier) │   │ (policy) │   │ (multi-prov) │     │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └──────┬───────┘     │
│       │              │              │                 │            │
│       └──────────────┴──────┬───────┴─────────────────┘            │
│                             │                                      │
│                       Orchestrator Loop                            │
│                  (Plan → Retrieve → Execute → Verify)              │
│                             │                                      │
│                             ▼                                      │
│                    MCP Bridge (stdio)                              │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
   Claude Code           Gemini CLI              Cursor / Editor
  (subprocess)          (subprocess)              (MCP client)
```

**Tech stack (locked-in):**

| Layer            | Choice                                  | Source             |
| ---------------- | --------------------------------------- | ------------------ |
| CLI core         | TypeScript + Node 20 LTS                | Build              |
| AST parsing      | tree-sitter (web-tree-sitter, WASM)     | From claude-context |
| Code graph       | SQLite (better-sqlite3) + custom schema | Build (port from graphify) |
| Vector store     | LanceDB (embedded)                      | Build (swap from claude-context's Milvus) |
| Embeddings       | Ollama default + OpenAI/Voyage/Gemini   | From claude-context |
| KV / session     | SQLite                                  | Build              |
| MCP server       | `@modelcontextprotocol/sdk` (TS)        | From claude-context-mcp |
| File watcher     | chokidar                                | From claude-context |
| Sandbox          | git worktrees default, Docker optional  | Build              |
| TUI              | Ink (React for CLI)                     | Build              |
| Process mgmt     | execa                                   | Build              |
| Schema validation| Zod                                     | Build              |

---

## 2. Source Repos to Fork / Study

These are the upstream projects you will reuse. **All MIT or Apache 2.0 — you are free to copy, modify, and ship.** Always preserve the original LICENSE file in `LICENSES/` and credit in `NOTICE.md`.

| Repo                                              | License    | Use For                                                | Action       |
| ------------------------------------------------- | ---------- | ------------------------------------------------------ | ------------ |
| `zilliztech/claude-context`                       | MIT        | MCP server, AST chunker, Merkle-tree incremental index, embeddings pipeline | **Fork as base** |
| `safishamsi/graphify`                             | MIT        | Tree-sitter symbol & call-graph extraction (25 langs), Leiden clustering, git hooks | **Port logic** |
| `awslabs/cli-agent-orchestrator` (CAO)            | Apache 2.0 | Multi-CLI sub-agent spawning, tool restriction patterns | **Reference + selective port** |
| `mksglu/context-mode`                             | Check repo | MCP-layer sandboxing pattern, hook-based redirection   | **Study pattern** |
| `safishamsi/Codebase-Memory` (arxiv 2603.27277)   | Open       | 6-strategy call resolution algorithm                   | **Study only** |

> **License rule:** Whenever you copy code from any of these, copy their LICENSE into `LICENSES/<project>-LICENSE.txt` and add a row to `NOTICE.md`.

---

## 3. Phase-by-Phase Build

> Mark tasks `[x]` when **acceptance test passes**. Add date.

### PHASE 0 — Setup & Reuse Audit (Days 1–2)

* [x] **0.1** Initialize repo: `pnpm init`, `tsconfig.json` (strict, ESNext, NodeNext), `.gitignore` (node_modules, dist, .env, *.db, .lance/, .coderelay/), `.editorconfig`, MIT LICENSE, stub README.md.
  *Acceptance:* `pnpm tsc --noEmit` exits 0. (2026-04-29)
* [x] **0.2** Set up monorepo with pnpm workspaces: (2026-04-29)
  ```
  /packages
    /core         — orchestrator + glue
    /indexer      — tree-sitter + graph (forked claude-context-core + ported graphify)
    /memory       — 3-tier memory (your differentiator)
    /router       — LLM provider abstraction
    /governor     — policy + sandbox + sanitizer (your differentiator)
    /mcp-server   — exposes tools to sub-agents (forked claude-context-mcp)
    /sub-agents   — Claude Code / Gemini CLI wrappers
    /cli          — Ink TUI binary
  /docs
  /LICENSES
  /tests
  /benchmarks
  /external      — git submodules of upstream repos for reference
  ```
  *Acceptance:* `pnpm -r build` succeeds with empty packages.
* [x] **0.3** **Clone upstream repos as git submodules** for reference: (2026-04-29)
  ```
  git submodule add https://github.com/zilliztech/claude-context        external/claude-context
  git submodule add https://github.com/safishamsi/graphify              external/graphify
  git submodule add https://github.com/awslabs/cli-agent-orchestrator   external/cao
  git submodule add https://github.com/mksglu/context-mode              external/context-mode
  ```
  *Acceptance:* All submodules clone, `external/<repo>/README.md` readable.
* [x] **0.4** **Reuse audit document** — read each upstream repo and write `docs/reuse-map.md` listing exactly which files we plan to copy/port and what we'll skip.
  *Acceptance:* `docs/reuse-map.md` covers all 4 repos with concrete file references. (2026-04-29)
* [x] **0.5** Copy LICENSE files from each upstream repo into `LICENSES/<project>-LICENSE.txt`. Create `NOTICE.md` listing them.
  *Acceptance:* Both files present and accurate. (2026-04-29)
* [x] **0.6** CI: GitHub Actions running `lint + typecheck + test` on push.
  *Acceptance:* Green check on a no-op commit. (2026-04-29)
* [ ] **0.7** Logging: Pino, pretty in dev, JSON in prod. One logger per package.
  *Acceptance:* `import { log } from "@coderelay/core"; log.info("hi")` prints.

### PHASE 1 — LLM Router (Days 3–5)

> Build from scratch — small, easy, and the foundation for everything else.

* [ ] **1.1** Define `LLMProvider` interface: `complete(messages, opts) -> AsyncIterable<chunk>`, `embed(texts) -> number[][]`, `countTokens(s) -> number`.
  *Acceptance:* Interface compiles with docstring.
* [ ] **1.2** Implement adapters: `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`, `OllamaProvider`. Stream + non-stream.
  *Acceptance:* Smoke test hits each provider (skipped if no API key).
* [ ] **1.3** Routing rules engine: tag tasks (`embed | summarize | plan | code-gen | classify | sanitize`) → cheapest model meeting quality bar. YAML config with hot-reload.
  *Acceptance:* Unit test: a `summarize` task on 5k tokens routes to Ollama, not Claude.
* [ ] **1.4** Token & cost accounting: persist per-call to SQLite `usage` table.
  *Acceptance:* `coderelay usage --today` prints a table.
* [ ] **1.5** Retry + circuit breaker (exponential backoff, 3 attempts, fail-open to next provider).
  *Acceptance:* Test simulates 429, retries succeed.

### PHASE 2 — Indexer + Code Graph (Days 6–10)

> **Strategy:** Fork claude-context-core's chunker + Merkle indexer, port graphify's symbol/call extractor, store in SQLite.

* [ ] **2.1** **Vendor `claude-context-core`** into `packages/indexer/src/upstream/`. Strip Milvus dependency. Keep:
  - `splitter/` (AST chunker)
  - `sync/` (Merkle-tree incremental indexer)
  - `embedding/` (provider abstraction — already supports OpenAI/Voyage/Ollama/Gemini)
  Document changes in `packages/indexer/UPSTREAM.md`.
  *Acceptance:* Chunker produces same chunks as upstream on a fixture file.
* [ ] **2.2** **Define graph schema in SQLite** (better-sqlite3 with WAL):
  ```sql
  files (id, path, hash, lang, mtime, indexed_at)
  symbols (id, file_id, parent_id, kind, name, qualified_name, start, end, signature, docstring)
  edges (src, dst, kind, confidence)   -- kind: calls|imports|extends|implements|references
  chunks (id, symbol_id, file_id, content, token_count, embedding_ref)
  ```
  See `docs/architecture.md` for full DDL.
  *Acceptance:* `pnpm migrate` creates schema, fixture insert + query works.
* [ ] **2.3** **Port graphify's `extract.py` to TypeScript** as `packages/indexer/src/extract.ts`. Use `web-tree-sitter` instead of `py-tree-sitter`. Cover same languages: TypeScript, JavaScript, Python, Go, Rust, Java, C/C++ (extend later).
  *Acceptance:* On a 200-line TS file, extracts ≥95% of expected symbols (manual diff vs graphify Python output).
* [ ] **2.4** **6-strategy edge resolver** (port from Codebase-Memory paper logic):
  1. exact qualified name → 2. local scope → 3. file-scope alias → 4. import-resolved → 5. type-system hint → 6. fuzzy name match (low confidence)
  Confidence stored on each edge.
  *Acceptance:* On fixture repo, ≥85% of true edges captured (gold set).
* [ ] **2.5** **LanceDB adapter** replacing claude-context's Milvus adapter. Implement `VectorStore` interface (insert, search, delete).
  *Acceptance:* Round-trip embed → store → search returns same chunk.
* [ ] **2.6** **Wire the pipeline**: file change → Merkle diff → re-extract symbols + edges → re-chunk → re-embed → upsert.
  *Acceptance:* Edit one function in 1000-file repo, verify only that file's rows update via SQL.
* [ ] **2.7** **CLI commands**: `coderelay index <path>`, `coderelay index --watch`, `coderelay graph stats`, `coderelay search "<query>"`.
  *Acceptance:* Indexing CodeRelay's own repo finishes in <60s.

### PHASE 3 — Memory System (Days 11–14)

> **Build from scratch.** This is your primary differentiator — none of the upstream repos do tiered memory + context manifest properly.

* [ ] **3.1** **Working memory**: in-process `Map<string, any>` keyed by task ID. Lives only for current task.
  *Acceptance:* Two parallel tasks don't see each other's memory.
* [ ] **3.2** **Session memory**: SQLite `sessions` + `session_turns` tables. Auto-summarize every 20 turns via router's `summarize` tag.
  *Acceptance:* After 25 turns, summary row appears, oldest turns archived.
* [ ] **3.3** **Long-term memory**: `facts` table (text + embedding) + auto-maintained `PROJECT.md` (architecture decisions, conventions, glossary). Updated by LLM at session end.
  *Acceptance:* Restart CLI: `coderelay recall "auth flow"` returns prior facts.
* [ ] **3.4** **Context manifest**: every prompt assembly logs `{file, symbol, chunk_id, tokens, reason}` per task. Prevents re-loading.
  *Acceptance:* Same task run twice → second uses 100% of prior manifest, zero re-parses.
* [ ] **3.5** **MemGPT-style paging**: hot context in prompt, cold retrieved on tool call. Hard cap on prompt tokens (configurable).
  *Acceptance:* Task "needing" 50k tokens of context runs in 8k window via paged retrieval.

### PHASE 4 — MCP Server (Days 15–16)

> **Strategy:** Fork claude-context-mcp boilerplate, replace its 4 tools with our richer set.

* [ ] **4.1** **Vendor `claude-context-mcp`** into `packages/mcp-server/`. Keep stdio transport, server scaffolding. Strip Milvus-specific tools.
  *Acceptance:* `npx @modelcontextprotocol/inspector packages/mcp-server` connects.
* [ ] **4.2** Expose CodeRelay tools (Zod-validated, descriptive — descriptions matter for sub-agent accuracy):
  - `get_relevant_context(query, max_tokens)` — hybrid vector + graph
  - `get_symbol(qualified_name)` — definition + signature
  - `get_callers(qualified_name)` — graph traversal
  - `get_callees(qualified_name)`
  - `get_file_summary(path)` — cached LLM summary
  - `search_semantic(query, k)` — vector top-k
  - `find_similar_code(snippet)` — embedding NN
  - `get_dependency_tree(path)`
  - `recall_fact(query)` — long-term memory
  - `record_decision(text)` — write to PROJECT.md
  *Acceptance:* All tools callable from MCP Inspector, return well-formed JSON.
* [ ] **4.3** Expose resources: `repo://structure`, `repo://project-md`, `repo://recent-changes`.
  *Acceptance:* Inspector lists & fetches each.
* [ ] **4.4** Expose prompt templates: `/explain-symbol`, `/refactor-aware`, `/find-bug`.
  *Acceptance:* Each renders with substituted args.

### PHASE 5 — Sub-Agent Wrapping (Days 17–19)

> **Strategy:** Study CAO's provider abstractions, write our own TypeScript wrappers (CAO is Python).

* [ ] **5.1** Read `external/cao/cli_agent_orchestrator/providers/`. Document patterns in `docs/reuse-map.md`.
  *Acceptance:* Notes cover at least claude_code, gemini_cli, codex providers.
* [ ] **5.2** Spawn Claude Code as subprocess via `execa`, with our MCP server registered in `.mcp.json` (auto-generated in sandbox CWD).
  *Acceptance:* `coderelay run --agent claude "rename foo to bar"` makes Claude Code call OUR `get_symbol`, not raw grep.
* [ ] **5.3** Same for Gemini CLI (`~/.gemini/settings.json`, project-scoped).
  *Acceptance:* `coderelay run --agent gemini "..."` works end-to-end.
* [ ] **5.4** I/O capture: stream sub-agent stdout/stderr through governor; parse tool calls; log every action.
  *Acceptance:* Action log shows every tool call with timestamp + duration.
* [ ] **5.5** **Tool shadowing**: prefix system prompt instructing sub-agent to prefer CodeRelay tools over raw `Read`/`Grep`. Use Claude Code hooks where available to intercept and redirect.
  *Acceptance:* On 10-file task, sub-agent uses our tools ≥80% vs raw file reads.

### PHASE 6 — Governance Layer (Days 20–23)

> **Strategy:** Study context-mode's hook redirection, build our own. This is a differentiator — no single upstream does sanitization + secrets + sandbox + rollback as one coherent layer.

* [ ] **6.1** **Permission policy** (YAML): allow/deny shell commands, file paths (writable globs), network egress, env-var access.
  *Acceptance:* `rm -rf /` is blocked even if sub-agent tries it.
* [ ] **6.2** **Hard-coded destructive blocklist** (always-on, not user-configurable):
  `rm -rf`, `DROP TABLE`, `DROP DATABASE`, `git push --force`, `chmod 777 -R`, `:(){ :|:& };:`, `mkfs`, `dd if=`, etc.
  *Acceptance:* Each pattern blocked at policy layer with clear error.
* [ ] **6.3** **Git worktree sandbox**: every task runs in fresh worktree branch `coderelay/task-<id>`. Merge to main only on explicit approval.
  *Acceptance:* Failed task leaves main untouched.
* [ ] **6.4** **Action log**: append-only JSONL of every sub-agent action; `coderelay rollback <task-id>` resets to pre-task.
  *Acceptance:* Run task, inspect log, rollback, verify clean tree.
* [ ] **6.5** **Prompt-injection sanitizer**: strip/flag suspicious instructions in any external text fed into LLM. Heuristics: "ignore previous", "system:", embedded tool calls.
  *Acceptance:* Test with known injection patterns → all flagged.
* [ ] **6.6** **Secret scanner**: gitleaks rules on any file content before LLM. Mask matched secrets.
  *Acceptance:* AWS key in source → masked in outbound prompt.
* [ ] **6.7** **Egress filter** (Docker mode): allow-list of domains for sub-agent's network calls.
  *Acceptance:* Disallowed domain blocked; allowed succeeds.

### PHASE 7 — Orchestrator Loop (Days 24–27)

> **Build from scratch.** Your second differentiator: per-step alignment + verification — none of the upstream projects do this.

* [ ] **7.1** **Planner**: takes user task + repo summary, calls planner-LLM, emits structured plan: `[{step, intent, expected_files, tools_needed}]`.
  *Acceptance:* For "add caching to UserService", plan lists ≥2 steps with right files.
* [ ] **7.2** **Retriever**: per step, builds context manifest under token budget. Combines graph neighborhood + vector top-k.
  *Acceptance:* Manifest never exceeds budget; coverage ≥90% on synthetic test.
* [ ] **7.3** **Executor**: hands `{step, manifest, tools}` to sub-agent. Streams results back.
  *Acceptance:* Sub-agent completes single step, log captures full trace.
* [ ] **7.4** **Verifier** runs after each step:
  - language type-check (`tsc`/`pyright`/`cargo check`)
  - linters
  - **graph-aware test selection**: only tests touching changed symbols
  - AST diff: did change match `expected_files`?
  *Acceptance:* On deliberately broken change, verifier blocks merge with specific error.
* [ ] **7.5** **Re-aligner**: after each step, planner-LLM checks if remaining plan still matches user intent. Replans if drift > threshold.
  *Acceptance:* Mid-plan, simulate unexpected file change → re-aligner adjusts.
* [ ] **7.6** **Memory update**: write step outcome (success/failure, files, decisions) to long-term memory + PROJECT.md.
  *Acceptance:* Next task in same area has prior decisions in context.

### PHASE 8 — TUI + DX (Days 28–30)

* [ ] **8.1** Ink-based TUI: live view of plan, current step, token spend, action log tail.
  *Acceptance:* Visually verify on real task.
* [ ] **8.2** Slash commands: `/plan`, `/status`, `/rollback`, `/cost`, `/context`, `/explain` (why was X retrieved?).
  *Acceptance:* Each works.
* [ ] **8.3** Config wizard: `coderelay init` detects project type, writes default `coderelay.yaml`.
  *Acceptance:* On fresh repo, generates working config.
* [ ] **8.4** Documentation: `README.md` (quickstart), `docs/architecture.md`, `docs/configuring.md`, `docs/safety.md`, `docs/reuse-map.md`, `NOTICE.md`.
  *Acceptance:* New user can install + run first task in <10 minutes.

### PHASE 9 — Benchmarks + Release (Days 31–33)

* [ ] **9.1** Benchmark harness: 10 real tasks across 3 sample repos. Measure tokens, time, success rate.
  *Acceptance:* Reproducible `pnpm bench` run.
* [ ] **9.2** Compare CodeRelay-wrapped vs raw Claude Code. Target: **≥60% token reduction, ≥90% success parity**.
  *Acceptance:* Numbers in `benchmarks/README.md`.
* [ ] **9.3** Performance pass: indexer <2 min on 100k LoC, retriever <500ms p95.
  *Acceptance:* Both targets met on reference repo.
* [ ] **9.4** Release v0.1.0 to npm: `npm publish`. Tag git. Release notes credit upstream projects.
  *Acceptance:* `npm i -g coderelay` works on fresh machine.

### PHASE 10 — Post-MVP Roadmap (parking lot)

- [ ] Runtime debugger agent (parses logs/stack traces)
- [ ] Design-quality verifier (cyclomatic complexity, duplication, SOLID)
- [ ] Multi-agent coordination (Claude + Gemini collaborate)
- [ ] VSCode extension talking to local CodeRelay daemon
- [ ] Web dashboard for project knowledge graph
- [ ] Team mode: shared memory across developers (encrypted, opt-in)

---

## 4. Definition of Done (v1)

On a 50k+ LoC unfamiliar repo:
1. `coderelay index` finishes in <3 minutes.
2. Complex refactor task ("rename `User.email` to `User.primaryEmail` everywhere") completes with ≥60% fewer tokens than raw Claude Code, no destructive action, all tests passing.
3. Resuming next day, prior decisions recalled without re-reading any file.
4. `coderelay rollback` cleanly reverts any failed task.
5. `NOTICE.md` and `LICENSES/` properly credit all upstream sources.
6. Documented enough for another dev to install & use without help.

---

## 5. Living Risks Register

| Risk                                     | Mitigation                                                |
| ---------------------------------------- | --------------------------------------------------------- |
| Upstream repo APIs change                | Pin to specific commit SHA in submodules; only update deliberately |
| Tree-sitter grammar bugs on edge syntax  | Confidence-tagged edges; fall back to text search         |
| Sub-agent ignores our MCP tools          | Strong system-prompt prefix + hooks + benchmark           |
| MCP protocol churn                       | Pin SDK version; integration test on each upgrade         |
| Vector store drift after large refactor  | Re-embed on chunk hash change; nightly verification       |
| Token cost during dev                    | Default to Ollama for everything except final code-gen    |
| License compliance slip                  | Pre-commit hook checks `LICENSES/` matches `external/`    |
| Scope creep                              | Phase 10 is parking lot; do not start until Phase 9 ✅    |

---

## 6. Daily Closing Ritual

At end of each working session:
1. Tick checkboxes here with completion date.
2. Note blockers/surprises in `docs/journal.md`.
3. Update `prompt.md` so tomorrow's session knows the next task.
4. Commit + push.
