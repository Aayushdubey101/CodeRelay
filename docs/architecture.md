# CodeRelay — Architecture (`docs/architecture.md`)

> Design invariants. **Do not break these without updating this file in the same commit.**

---

## 1. Core Principle

> **The sub-agent (Claude Code / Gemini / Cursor) must never read a raw file when CodeRelay can answer the same question from its graph or memory.**

Every architectural decision serves this rule. It's how we cut tokens, prevent re-work, and reduce hallucination.

---

## 2. Build Strategy: Fork & Integrate

We do not build from scratch. We integrate proven open-source projects (all MIT or Apache 2.0):

| Layer in our stack       | Upstream source                       | What we take                                     | What we add                              |
| ------------------------ | ------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| MCP server scaffold      | `zilliztech/claude-context`           | stdio transport, server init, tool registration  | Our 10 tools instead of their 4          |
| AST chunker              | `zilliztech/claude-context`           | language-aware chunking, fallback splitter       | Stable hash IDs, symbol linkage          |
| Merkle incremental index | `zilliztech/claude-context`           | xxh3-keyed file change detection                 | Trigger graph re-extraction, not just chunks |
| Embeddings pipeline      | `zilliztech/claude-context`           | Provider abstraction (OpenAI/Voyage/Ollama/Gemini) | LanceDB adapter (replace Milvus)         |
| Tree-sitter extractors   | `safishamsi/graphify` (Python → port) | Per-language symbol & call-graph rules           | TypeScript port; SQLite output           |
| Call resolution          | Codebase-Memory paper                 | 6-strategy algorithm                             | Confidence-tagged edges                  |
| Sub-agent provider abstr | `awslabs/cli-agent-orchestrator`      | Pattern for spawning/restricting 7 CLI agents    | TypeScript reimplementation              |
| Governance pattern       | `mksglu/context-mode`                 | MCP-layer hook redirection idea                  | Our policy + sanitizer + secrets         |

**License compliance**: every copied file gets an attribution header. Upstream LICENSE files live in `LICENSES/`. `NOTICE.md` lists every upstream credit.

---

## 3. Layer Responsibilities

### 3.1 Indexer (`packages/indexer`)
- **Input:** filesystem paths + change events.
- **Output:** rows in SQLite graph + chunks + embeddings in LanceDB.
- **Invariants:**
  - Same file content → identical chunk IDs (deterministic via xxh3 of normalized AST).
  - Incremental: editing one file touches only that file's rows.
  - Never blocks: indexing runs in worker thread; queries can read stale data with `staleness` flag.

### 3.2 Memory (`packages/memory`)
Three tiers. Do not collapse them:
- **Working** — RAM, per-task, dies with task.
- **Session** — SQLite, per-conversation, summarized every N turns.
- **Long-term** — SQLite + LanceDB + `PROJECT.md`, persists forever, written by LLM at session end.

**Invariant:** Every memory read is logged to the **context manifest** so the planner knows what's in the prompt.

### 3.3 Router (`packages/router`)
Single entry point for **every** LLM call.
- Tags: `embed | summarize | plan | code-gen | classify | sanitize`
- Routing config: YAML, hot-reload.
- Outputs: tokens, cost, latency to `usage` table.

**Invariant:** No package imports a provider SDK directly. They all import `@coderelay/router`.

### 3.4 Governor (`packages/governor`)
- Policy engine (YAML rules → in-memory matcher).
- Hard-coded destructive blocklist (cannot be overridden).
- Action log (append-only JSONL, `.coderelay/log/<task-id>.jsonl`).
- Sandbox driver (git worktree default, Docker optional).
- Prompt-injection sanitizer + secret scanner: every LLM input passes through.

**Invariant:** Destructive blocklist is enforced **before** policy YAML. YAML can only further restrict, never relax.

### 3.5 MCP Server (`packages/mcp-server`)
- Speaks MCP over stdio.
- Exposes ~10 tools (see `work.md` Phase 4.2).
- All tools have Zod-validated input/output schemas.

**Invariant:** Tool descriptions are written for LLM consumption — verbose, with examples in the description text. Cryptic descriptions break sub-agent accuracy.

### 3.6 Orchestrator (`packages/core`)
The Plan → Retrieve → Execute → Verify → Re-align loop.
- One **task** per top-level user request.
- Task state machine: `pending → planning → executing → verifying → done | failed | rolled-back`.

**Invariant:** Every state transition is journaled. Crash mid-task → on restart, resume from last journaled state.

### 3.7 Sub-Agents (`packages/sub-agents`)
- Wrappers for `claude` (Claude Code), `gemini` (Gemini CLI), and others.
- Each: spawn subprocess with our MCP registered, capture I/O, parse tool calls.

**Invariant:** Sub-agent never runs outside the governor's sandbox. No exceptions.

### 3.8 CLI (`packages/cli`)
- Thin Ink TUI on top of orchestrator.
- All business logic lives in `core` so it's testable without the TUI.

---

## 4. Data Schema (SQLite)

```sql
-- Indexer
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  hash TEXT NOT NULL,                  -- xxh3 of content
  lang TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL
);

CREATE TABLE symbols (
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES symbols(id),
  kind TEXT NOT NULL,                  -- function|class|method|interface|export|import
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  start_byte INTEGER, end_byte INTEGER,
  signature TEXT,
  docstring TEXT
);
CREATE INDEX idx_symbols_qn ON symbols(qualified_name);
CREATE INDEX idx_symbols_file ON symbols(file_id);

CREATE TABLE edges (
  src INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  dst INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                  -- calls|imports|extends|implements|references
  confidence REAL NOT NULL,            -- 0..1 from 6-strategy resolver
  PRIMARY KEY (src, dst, kind)
);
CREATE INDEX idx_edges_dst ON edges(dst, kind);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,                 -- stable hash-based ID
  symbol_id INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
  file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding_ref TEXT                   -- pointer into LanceDB
);

-- Memory
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER, last_active INTEGER,
  summary TEXT
);
CREATE TABLE session_turns (
  id INTEGER PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT, content TEXT, tokens INTEGER, created_at INTEGER
);
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  text TEXT, embedding_ref TEXT,
  source TEXT, created_at INTEGER, importance REAL
);

-- Router
CREATE TABLE usage (
  id INTEGER PRIMARY KEY,
  ts INTEGER, provider TEXT, model TEXT, task_tag TEXT,
  tokens_in INTEGER, tokens_out INTEGER, cost_usd REAL, latency_ms INTEGER
);

-- Orchestrator
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_request TEXT, plan_json TEXT, state TEXT,
  started_at INTEGER, finished_at INTEGER, result TEXT
);
```

---

## 5. The Plan→Retrieve→Execute→Verify→Re-align Loop

```ts
async function runTask(req: UserRequest) {
  const task = await tasks.create(req);
  let plan = await planner.plan(req, repoSummary());          // step 1
  for (const step of plan.steps) {
    const manifest = await retriever.build(step, budget);      // step 2
    const sanitized = governor.sanitize(manifest);
    const result = await executor.run(step, sanitized);        // step 3
    const verdict = await verifier.check(step, result);        // step 4
    if (!verdict.ok) {
      await governor.rollback(task.id);
      throw new StepFailed(step, verdict);
    }
    plan = await planner.realign(plan, step, result);          // step 5
    await memory.recordOutcome(task.id, step, result);
  }
  await memory.consolidate(task.id);                           // write to PROJECT.md
}
```

Key choices:
- **Re-align is mandatory after every step**, not just at end.
- **Verifier is per-language pluggable** (TS uses `tsc`, Python uses `pyright`, etc.).
- **Manifest token budget** ≤ 60% of model context window — leaves room for sub-agent's own thinking.

---

## 6. Sub-Agent Integration Strategy

| Agent       | Mechanism                              | Notes                                                       |
| ----------- | -------------------------------------- | ----------------------------------------------------------- |
| Claude Code | MCP via `.mcp.json` + hooks            | Hooks let us redirect Read/Bash → our sandboxed equivalents |
| Gemini CLI  | MCP via `~/.gemini/settings.json`      | Project-scoped settings file we generate                    |
| Cursor      | MCP via Cursor settings or LSP bridge  | Lower priority for v1                                       |
| Codex CLI   | MCP via `~/.codex/config.toml`         | Note: top-level key is `mcp_servers` not `mcpServers`       |
| Antigravity | Manual instruction file (no hook API)  | Document for users; don't auto-write (avoids git pollution) |

**Tool-shadowing system prompt** prepended to every sub-agent invocation:

```
You have access to specialized tools from the `coderelay` MCP server. Prefer
these over raw file reads / shell greps:
- get_relevant_context  — instead of Read+Grep on multiple files
- get_symbol            — instead of grepping for a function definition
- get_callers / get_callees — instead of guessing call sites
- search_semantic       — instead of full-text grep on prose

Raw Read/Grep are still available but waste tokens. Use coderelay tools first.
```

---

## 7. Why These Specific Choices

| Decision                    | Reason                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| TypeScript not Rust         | MCP TS SDK is canonical; matches claude-context (our biggest fork base)          |
| SQLite for graph not Kuzu   | Codebase-Memory paper showed SQLite is sufficient at code-graph scale            |
| LanceDB not Milvus          | Embedded, zero-server (we swap claude-context's Milvus dep out)                  |
| Tree-sitter not LSP         | Multi-language, faster, no compiler toolchain dependency                         |
| Worktree-default sandbox    | Cheap, instant rollback, no Docker required for first-run UX                     |
| Ollama-default for embeddings | Privacy + zero ongoing cost during dev                                         |
| MCP not custom protocol     | Interop with existing agents; mature spec; broad ecosystem                       |
| Fork over rewrite           | Saves ~13 days of work; battle-tested code; we focus on differentiators          |

---

## 8. Anti-Goals

These are explicitly **not** what CodeRelay tries to be:
- ❌ A new LLM (we wrap, never train).
- ❌ A cloud service (everything local-first; cloud is opt-in via API keys).
- ❌ A replacement for Claude Code (we make it better, not duplicate it).
- ❌ A general-purpose agent framework (scope: code only).
- ❌ A GUI IDE (TUI only for v1; VS Code extension is post-MVP).

---

## 9. Performance Budget

| Operation                               | Target (p95)         |
| --------------------------------------- | -------------------- |
| Full index of 100k LoC repo             | < 2 minutes          |
| Incremental update on file save         | < 200 ms             |
| `get_relevant_context` query            | < 500 ms             |
| Sub-agent task end-to-end overhead      | < 5% of task latency |
| Memory query (`recall_fact`)            | < 100 ms             |

If any target slips by >2× during dev, open a perf issue **before** moving to next phase.

---

## 10. Differentiators (what only CodeRelay does)

These are the parts that justify building this rather than just using upstream tools as-is:

1. **Tiered memory + context manifest** — none of `claude-context`, `graphify`, `CAO` do persistent cross-session memory with explicit token accounting.
2. **Per-step alignment loop** — the orchestrator re-checks user intent after every step. Upstream agents replan only on failure.
3. **Coherent governance** — sandbox + blocklist + sanitizer + secret scanner + rollback as one integrated layer (most projects have one or two).
4. **Graph-aware test selection** — verifier runs only tests that touch changed symbols. Saves time on large repos.
5. **Cross-agent shared state** — Claude Code session and Gemini session see the same memory + manifest.

If during the build you find an upstream project already does any of these, update this section.
