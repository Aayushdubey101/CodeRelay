# Next-Session Prompt (`prompt.md`)

> **What this file is:** Paste the contents of the **Paste-Into-Claude-Code Block** below into Claude Code at the start of every new session. It tells the agent (a) what's been done, (b) what to do next, (c) what rules to follow.
> **How to maintain:** At the end of every session, edit the **CURRENT TASK** and **DONE THIS SESSION** sections. Tick the matching box in `work.md`. Bump the **Phase Pointer**.

---

## 🟢 Phase Pointer

**Currently on:** Phase 4 — MCP Server
**Next concrete task:** `4.3 Resources + 4.4 Prompt templates`

> When phase finishes, update this pointer + tick all phase boxes below.

### Phase Tick-Off
- [x] Phase 0 — Setup & Reuse Audit
- [x] Phase 1 — LLM Router
- [x] Phase 2 — Indexer + Code Graph
- [x] Phase 3 — Memory System
- [ ] Phase 4 — MCP Server
- [ ] Phase 5 — Sub-Agent Wrapping
- [ ] Phase 6 — Governance Layer
- [ ] Phase 7 — Orchestrator Loop
- [ ] Phase 8 — TUI + DX
- [ ] Phase 9 — Benchmarks + Release

---

## 📋 Paste-Into-Claude-Code Block (start of every session)

```
You are continuing work on CodeRelay — a CLI orchestrator that wraps coding
agents (Claude Code, Gemini CLI, Cursor) with a shared codebase graph,
memory layer, and governance.

PROJECT STRATEGY:
We are NOT building from scratch. We FORK and INTEGRATE existing
MIT/Apache-licensed open-source projects for ~60% of the codebase. We focus
our own coding effort on the differentiators: memory tiers, alignment loop,
governance layer.

UPSTREAM PROJECTS WE REUSE:
- zilliztech/claude-context (MIT)   → MCP server + AST chunker + Merkle indexer
- safishamsi/graphify (MIT)         → tree-sitter symbol/call extraction
- awslabs/cli-agent-orchestrator (Apache 2.0) → multi-CLI sub-agent patterns
- mksglu/context-mode               → MCP-layer sandboxing pattern (study)

LICENSE RULE: Whenever you copy code from any upstream repo, copy its LICENSE
file into LICENSES/<project>-LICENSE.txt and add a row to NOTICE.md in the
same commit. Never strip attribution headers from copied files.

READ FIRST (in order):
1. work.md — full build plan; ticked checkboxes show progress
2. prompt.md — this file; CURRENT TASK below tells you what to do
3. docs/journal.md — recent blockers / decisions
4. docs/architecture.md — design invariants you must not break
5. NOTICE.md — current upstream attributions
6. docs/reuse-map.md — what to copy from where (created in task 0.4)

RULES:
- Stay strictly within the CURRENT TASK below. Do NOT do work from later phases.
- Before writing code, list the files you will create/edit and wait for approval
  if uncertain.
- After finishing, update prompt.md (CURRENT TASK + DONE THIS SESSION) and
  tick the matching box in work.md with today's date.
- If the task's Acceptance test cannot pass, STOP and document the blocker in
  docs/journal.md instead of forcing a workaround.
- Never delete or weaken safety code (governor, blocklist, sanitizer).
- Use pnpm, not npm. Use TypeScript strict mode. Run `pnpm tsc --noEmit` before
  declaring done.
- When copying upstream code, mark every copied file with a header comment:
    /* Adapted from <repo>@<commit-sha>, MIT/Apache. See LICENSES/<repo>-LICENSE.txt */
- Pin upstream submodules to specific commit SHAs. Do not auto-track main.

CURRENT TASK
============
ID:        4.3 + 4.4
Title:     MCP resources + prompt templates
From:      work.md → Phase 4 → 4.3, 4.4
Acceptance: Inspector lists & fetches resources; prompt templates render with args.
Sub-steps:
  1. Add 3 resources to server.ts (packages/mcp-server/src/server.ts):
       repo://structure   → files table summary (counts by lang)
       repo://project-md  → contents of PROJECT.md
       repo://recent-changes → last 20 indexed files by mtime
  2. Add 3 prompt templates:
       /explain-symbol(qualified_name) → "Explain symbol X…"
       /refactor-aware(file, description) → refactor prompt with file context
       /find-bug(file, symptom) → debugging prompt with file chunks
  3. pnpm tsc --noEmit exits 0
```

---

## 📅 DONE THIS SESSION

- 2026-05-04: Task 4.1+4.2 complete — MCP server in packages/mcp-server/src/server.ts. McpServer (SDK 1.29) + StdioServerTransport. 10 tools: get_relevant_context, get_symbol, get_callers, get_callees, get_file_summary, search_semantic, find_similar_code, get_dependency_tree, recall_fact, record_decision. Server starts on stdio. 101/101 tests green.
- 2026-05-04: Task 3.5 complete — ContextPager in packages/memory/src/pager.ts. LRU hot/cold split, SQLite cold storage, retrieve promotes to hot. 50k tokens runs in 8k window. 9 unit tests.
- 2026-05-04: Task 3.4 complete — ContextManifest in packages/memory/src/manifest.ts. SQLite manifests table, UNIQUE(task_id,file,symbol,chunk_id) dedup on upsert. 9 unit tests. 101/101 green. Phase 3 complete.
- 2026-05-03: Task 3.3 complete — LongTermMemory in packages/memory/src/longterm.ts. facts table (id/text/embedding BLOB/ts/tags). LIKE fallback + cosine-similarity vector search (injected Embedding). `coderelay remember` + `coderelay recall` CLI commands. 9 unit tests. 83/83 green.
- 2026-05-03: Task 3.2 complete — SessionMemory in packages/memory/src/session.ts. SQLite sessions+session_turns, WAL, FK cascade. Auto-summarize every N turns (injected Summarizer fn), keeps last K turns active. 11 unit tests including 25-turn acceptance scenario. 74/74 tests green.
- 2026-05-03: Task 3.1 complete — WorkingMemory in packages/memory/src/working.ts. Map<taskId, Map<key, unknown>>, full isolation between tasks. get/set/delete/clear/keys/has API. 10 unit tests. 63/63 tests green.
- 2026-05-03: Task 2.7 complete — CLI commands: `coderelay index <path>`, `coderelay graph stats`, `coderelay search "<query>"` in packages/cli/src/index.ts. walkFiles() skips node_modules/dist/.git. Batch processing (50 files/batch) with progress output. Indexed own packages/ in 0.1s (44 files, 232 symbols, 641 chunks). 53/53 tests green. Phase 2 complete.
- 2026-05-03: Task 2.6 complete — IndexPipeline in packages/indexer/src/pipeline.ts. File hash-based Merkle diffing (skip unchanged), SQLite transaction per file (cascade delete old symbols→edges→chunks, reinsert), LanceDB embedding upsert on embedding provider present. 5 pipeline tests (index/skip/re-index/dedup/edges). 53/53 tests green.
- 2026-05-03: Task 2.5 complete — LanceVectorStore in packages/indexer/src/upstream/vectordb/lancedb.ts. Implements full VectorDatabase interface (createCollection, insert, search, delete, query, countRows, etc). apache-arrow 18 pinned for LanceDB peer dep. 7 round-trip tests. 47/47 tests green.
- 2026-05-03: Task 2.4 complete — EdgeResolver in packages/indexer/src/resolver.ts. 6 strategies: exact(1.0)/local-scope(0.95)/file-alias(0.9)/import-resolved(0.85)/type-hint(0.75)/fuzzy-Levenshtein(0.5). 9 unit tests + gold-set recall test. 40/40 tests green. TypeScript strict clean.
- 2026-05-03: Task 2.3 complete — SymbolExtractor in packages/indexer/src/extract.ts. web-tree-sitter WASM, 8 languages (TS/TSX/JS/Python/Go/Rust/Java/C++), named imports fix. 5 fixture tests: ≥95% symbol coverage, import/heritage/line-number/parent checks. 31/31 tests green. TypeScript strict clean.
- 2026-05-03: Task 2.2 complete — SQLite graph schema (files/symbols/edges/chunks, WAL, FK cascade). openGraphDb() in packages/indexer/src/db/. `coderelay migrate` CLI command. 9 schema tests. 26/26 tests green.
- 2026-05-03: Task 2.1 complete — vendored claude-context-core splitter/sync/embedding into packages/indexer/src/upstream/. Stripped Milvus (lancedb-stub.ts). Replaced native tree-sitter with regex TextCodeSplitter (web-tree-sitter in 2.3). 17 tests passing. TypeScript strict typecheck clean.
- 2026-05-01: Tasks 0.7 + Phase 1 (1.1–1.5) complete — Pino logging, LLMProvider interface, 4 provider adapters (Anthropic/OpenAI/Gemini/Ollama), YAML routing engine with hot-reload, SQLite usage tracking, retry + circuit breaker. `coderelay usage --today` CLI command. 11 tests passing.
- 2026-04-29: Task 0.1 complete — pnpm init, tsconfig (strict/ESNext/NodeNext), .gitignore, .gitattributes, .editorconfig, MIT LICENSE, src/index.ts stub, moved docs to docs/. `pnpm tsc --noEmit` exits 0. Initial commit `f0e0f20`.
- 2026-04-29: Task 0.2 complete — pnpm-workspace.yaml, 8 packages (core/indexer/memory/router/governor/mcp-server/sub-agents/cli) each with package.json + tsconfig + stub src/index.ts. LICENSES/, tests/, benchmarks/ dirs. `pnpm -r build` exits 0.
- 2026-04-29: Task 0.3 complete — 4 submodules pinned: claude-context@3675469, graphify@28b17d3, cao@1f2a048, context-mode@f00a1ab. All READMEs readable.
- 2026-04-29: Task 0.4 complete — docs/reuse-map.md written. Key finding: context-mode is ELv2 (study-only, no copy). claude-context+graphify+cao all MIT/Apache-2.0. Concrete file-to-target table for all 4 repos with adaptation notes.
- 2026-04-29: Task 0.5 complete — 5 LICENSE files copied to LICENSES/. NOTICE.md updated with real SHAs, license types, usage descriptions. cao-NOTICE.txt included per Apache 2.0 requirement.
- 2026-04-29: Task 0.6 complete — .github/workflows/ci.yml created (ubuntu/Node20/pnpm10, typecheck+test). vitest installed with --passWithNoTests. Pushed to github.com/Aayushdubey101/CodeRelay @ d90122b.

---

## 🚧 KNOWN BLOCKERS
*(none yet)*

---

## 🔁 How To Roll Forward (template for next time)

When you finish task `X.Y`:

1. In **Phase Pointer** above, replace `Currently on` and `Next concrete task` with the next ID/title from `work.md`.
2. In the **Paste-Into-Claude-Code Block**, replace the `CURRENT TASK` block with the new task's ID, title, acceptance, and sub-steps copied from `work.md`.
3. Add a one-line entry under **DONE THIS SESSION** with date.
4. Tick the matching `[ ]` → `[x]` line in `work.md` and append `(YYYY-MM-DD)`.
5. Commit `prompt.md` + `work.md` together with message `progress: complete X.Y`.

---

## 🧠 Cross-Session Memory Hints (sticky facts)

The agent should always know:

- **Language & runtime:** TypeScript, Node 20 LTS, pnpm workspaces.
- **Storage defaults:** SQLite (better-sqlite3) for graph + sessions; LanceDB for vectors. Both embedded.
- **MCP transport:** stdio. Server in `packages/mcp-server`.
- **Default LLM:** Ollama for embeddings + cheap tasks; Claude/Gemini/OpenAI for code-gen.
- **Tree-sitter:** WASM build (`web-tree-sitter`) for single npm-package distribution.
- **Sandbox default:** git worktree (cheap). Docker is opt-in.
- **Token discipline:** EVERY LLM call goes through `packages/router`.
- **Safety invariants:** destructive blocklist in `packages/governor` is hard-coded, never user-configurable.
- **Test policy:** vitest for unit; integration tests gated by env vars.
- **Reuse policy:** prefer fork-and-modify over rewrite; preserve upstream LICENSE files; mark adapted files with attribution header.
- **Submodule policy:** upstream repos live in `external/` as git submodules pinned to specific commits.

If any of these change, update `docs/architecture.md` + this section in the same commit.

---

## 🗂️ Quick-Reference: Where Things Live

```
coderelay/
├── work.md                  ← master plan, checklist
├── prompt.md                ← this file
├── README.md                ← quickstart for end users
├── NOTICE.md                ← upstream attributions
├── LICENSES/                ← copies of upstream LICENSE files
│   ├── claude-context-LICENSE.txt
│   ├── graphify-LICENSE.txt
│   └── cao-LICENSE.txt
├── external/                ← git submodules (read-only references)
│   ├── claude-context/
│   ├── graphify/
│   ├── cao/
│   └── context-mode/
├── packages/                ← our actual source code
│   ├── core/
│   ├── indexer/
│   ├── memory/
│   ├── router/
│   ├── governor/
│   ├── mcp-server/
│   ├── sub-agents/
│   └── cli/
├── docs/
│   ├── architecture.md      ← design invariants
│   ├── journal.md           ← daily blocker log
│   └── reuse-map.md         ← what to copy from where (created task 0.4)
├── tests/
└── benchmarks/
```
