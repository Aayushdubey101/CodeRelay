# Reuse Map

> **Status:** Complete — filled in during Task 0.4 (2026-04-29).
> Update whenever a new upstream is added or a new file is ported.

This file is the source of truth for **what we take from where**.

---

## 1. zilliztech/claude-context

- Pinned commit: `3675469`
- License: MIT
- Language: TypeScript
- Action: **Port and adapt** — copy source files, strip Milvus/cloud deps, swap to LanceDB

### Files to copy → target package

| Upstream file | Target | Notes |
|---|---|---|
| `packages/core/src/splitter/ast-splitter.ts` | `packages/indexer/src/splitter/ast-splitter.ts` | Switch `tree-sitter` Node bindings → `web-tree-sitter` (WASM). Remove LangChain fallback dep. |
| `packages/core/src/splitter/index.ts` | `packages/indexer/src/splitter/index.ts` | Keep `Splitter` interface + `CodeChunk` type. |
| `packages/core/src/sync/merkle.ts` | `packages/indexer/src/sync/merkle.ts` | Copy verbatim. `MerkleDAG` is self-contained. |
| `packages/core/src/sync/synchronizer.ts` | `packages/indexer/src/sync/synchronizer.ts` | Port. Replace `.context/merkle` snapshot path with `.coderelay/merkle`. |
| `packages/core/src/embedding/base-embedding.ts` | `packages/router/src/embedding/base.ts` | Copy abstract `Embedding` class verbatim. |
| `packages/core/src/embedding/ollama-embedding.ts` | `packages/router/src/embedding/ollama.ts` | Port. Our default embedding provider. |
| `packages/core/src/embedding/openai-embedding.ts` | `packages/router/src/embedding/openai.ts` | Port. |
| `packages/core/src/embedding/gemini-embedding.ts` | `packages/router/src/embedding/gemini.ts` | Port. |
| `packages/core/src/embedding/voyageai-embedding.ts` | `packages/router/src/embedding/voyageai.ts` | Port. |
| `packages/core/src/types.ts` | `packages/indexer/src/types.ts` | Port. Remove Milvus-specific fields. |
| `packages/core/src/utils/env-manager.ts` | `packages/core/src/utils/env.ts` | Port selectively — keep env-var loading logic. |
| `packages/mcp/src/snapshot.ts` | `packages/mcp-server/src/snapshot.ts` | Port. Replace file path from `~/.context/` → `~/.coderelay/`. |
| `packages/mcp/src/config.ts` | `packages/mcp-server/src/config.ts` | Port. Remove Milvus/Zilliz env vars. |
| `packages/mcp/src/utils.ts` | `packages/mcp-server/src/utils.ts` | Port verbatim — `ensureAbsolutePath`, `truncateContent`. |
| `packages/mcp/src/index.ts` | `packages/mcp-server/src/index.ts` | Adapt. Swap `ToolHandlers` internals from Milvus to LanceDB. |
| `packages/mcp/src/handlers.ts` | `packages/mcp-server/src/handlers.ts` | **Heavy adaptation.** Remove all Milvus/cloud-sync logic. Swap `context.semanticSearch` to LanceDB. Keep handler signatures and error shapes. |
| `packages/vscode-extension/wasm/*.wasm` | `packages/indexer/wasm/*.wasm` | Copy all 9 WASM grammar files for web-tree-sitter. |

### Files to skip

| Upstream path | Reason |
|---|---|
| `packages/chrome-extension/` | Browser extension — not applicable |
| `packages/vscode-extension/src/` | VSCode extension UI — not applicable |
| `packages/core/src/vectordb/milvus-*.ts` | Milvus vector DB — replaced by LanceDB |
| `packages/core/src/vectordb/zilliz-utils.ts` | Zilliz Cloud — replaced by LanceDB |
| `packages/core/src/splitter/langchain-splitter.ts` | LangChain dep — removed; AST splitter is primary |
| `evaluation/` | Python evaluation harness |
| `python/` | Python scripts |
| `examples/` | Demo code |
| `scripts/build-benchmark.js` | Build tooling |

### Key adaptation notes

- **Milvus → LanceDB**: All `VectorDatabase` interface calls become LanceDB equivalents. `milvus-vectordb.ts` is entirely replaced by `packages/indexer/src/vectordb/lance.ts` (built from scratch in Phase 2).
- **`~/.context/` → `~/.coderelay/`**: All snapshot/merkle paths updated.
- **Cloud sync removed**: `syncIndexedCodebasesFromCloud()` and `validateLegacyZeroEntries()` are deleted — we are embedded-only, no cloud backend.
- **Attribution header** required on every copied file: `/* Adapted from zilliztech/claude-context@3675469, MIT. See LICENSES/claude-context-LICENSE.txt */`

---

## 2. safishamsi/graphify

- Pinned commit: `28b17d3`
- License: MIT
- Language: **Python** — cannot copy directly; must translate logic to TypeScript
- Action: **Port logic** — read Python, rewrite equivalent TypeScript in `packages/indexer`

### Logic to port → target

| Upstream file | Target | What to port |
|---|---|---|
| `graphify/extract.py` | `packages/indexer/src/graph/extract.ts` | `LanguageConfig` dataclass → TS interface. Symbol/call-edge extraction algorithm using tree-sitter. Node-type lists per language (25 langs). `_make_id()` stable-ID helper. tsconfig alias resolution logic. |
| `graphify/build.py` | `packages/indexer/src/graph/build.ts` | Graph construction: nodes (symbols) + edges (calls/imports). SQLite schema design. |
| `graphify/detect.py` | `packages/indexer/src/graph/detect.ts` | Language detection from file extension + shebang. Map to tree-sitter grammar names. |
| `graphify/cache.py` | `packages/indexer/src/graph/cache.ts` | File-hash cache to skip unchanged files on re-index. Port SHA-256 content-hash approach. |
| `graphify/cluster.py` | `packages/indexer/src/graph/cluster.ts` | Leiden community detection — use `graphology` + `graphology-communities-louvain` as JS equivalent. Port the "module group" concept. |
| `tests/fixtures/` | `tests/fixtures/languages/` | Copy all `sample.*` fixture files for language parsing tests (20 languages). |

### Files to skip

| Upstream path | Reason |
|---|---|
| `graphify/llm.py` | LLM integration replaced by our `packages/router` |
| `graphify/serve.py` | HTTP server — we expose via MCP, not HTTP |
| `graphify/wiki.py` | Wiki/doc generation — out of scope Phase 2 |
| `graphify/benchmark.py` | Benchmarking — our own in `benchmarks/` |
| `graphify/report.py` | Reporting — out of scope |
| `graphify/transcribe.py` | Transcription — out of scope |
| `graphify/ingest.py` | Ingest orchestration — replaced by our `packages/core` orchestrator |
| `graphify/skill-*.md` | Agent skill files for other tools |
| `graphify/hooks.py` | Git hooks integration — out of scope Phase 2 |
| `worked/` | Example outputs |

### Key adaptation notes

- **Python → TypeScript**: All logic hand-translated. No Python runtime dependency.
- **tree-sitter**: graphify uses Python `tree_sitter_*` packages. We use `web-tree-sitter` WASM (same grammars, different binding).
- **SQLite schema**: graphify uses no DB — pure dict/JSON output. We persist to SQLite (`better-sqlite3`) with tables: `symbols`, `edges`, `files`.
- **25-language support**: Port `LanguageConfig` entries for all 25 languages graphify supports. Start with the 9 already covered by our WASM files; add more in Phase 2 iterations.
- **Attribution header** required: `/* Logic ported from safishamsi/graphify@28b17d3, MIT. See LICENSES/graphify-LICENSE.txt */`

---

## 3. awslabs/cli-agent-orchestrator (CAO)

- Pinned commit: `1f2a048`
- License: Apache 2.0
- Language: **Python** — translate patterns to TypeScript
- Action: **Port patterns** — translate provider abstraction and sub-agent lifecycle to TS

### Logic to port → target

| Upstream file | Target | What to port |
|---|---|---|
| `src/cli_agent_orchestrator/providers/base.py` | `packages/sub-agents/src/providers/base.ts` | `BaseProvider` abstract class → TS abstract class. `TerminalStatus` enum. `initialize()`, `get_status()`, `extract_last_message_from_script()`, `exit_cli()`, `cleanup()` abstract methods. `paste_enter_count` property pattern. |
| `src/cli_agent_orchestrator/providers/claude_code.py` | `packages/sub-agents/src/providers/claude-code.ts` | Full Claude Code provider. Status detection patterns (idle/processing/completed prompts). Message extraction regex. `--print` flag for non-interactive mode. |
| `src/cli_agent_orchestrator/providers/gemini_cli.py` | `packages/sub-agents/src/providers/gemini-cli.ts` | Gemini CLI provider. TUI output parsing. `extraction_retries` override pattern. |
| `src/cli_agent_orchestrator/models/session.py` | `packages/sub-agents/src/models/session.ts` | Session model: `session_id`, `task`, `status`, `created_at`, `completed_at`. |
| `src/cli_agent_orchestrator/models/agent_profile.py` | `packages/sub-agents/src/models/agent-profile.ts` | Agent profile model: `name`, `provider`, `allowed_tools`, `system_prompt`. |
| `src/cli_agent_orchestrator/models/provider.py` | `packages/sub-agents/src/models/provider.ts` | Provider registry model. |
| `src/cli_agent_orchestrator/services/session_service.py` | `packages/sub-agents/src/services/session-service.ts` | Session lifecycle: create, assign task, poll status, collect response. Replace tmux with `execa` subprocess management. |
| `src/cli_agent_orchestrator/utils/tool_mapping.py` | `packages/sub-agents/src/utils/tool-mapping.ts` | CAO tool-name → provider-specific flag mapping (e.g. `allowed_tools` list → `--allowedTools` flag for Claude Code). |
| `src/cli_agent_orchestrator/mcp_server/server.py` | `packages/mcp-server/src/sub-agent-tools.ts` | Study the `assign`, `handoff`, `send_message` MCP tool shapes. Port tool definitions (not implementation). |
| `src/cli_agent_orchestrator/skills/*.md` | `packages/sub-agents/src/skills/` | Port supervisor/worker protocol skill descriptions as TS constants. |

### Files to skip

| Upstream path | Reason |
|---|---|
| `web/` | React dashboard — we use Ink TUI |
| `src/.../clients/tmux.py` | tmux client — replaced by `execa` |
| `src/.../providers/codex.py`, `kiro_cli.py`, `kimi_cli.py`, `q_cli.py`, `opencode_cli.py`, `copilot_cli.py` | Out-of-scope providers for Phase 5 (add later) |
| `src/.../api/` | FastAPI REST layer — we use MCP stdio |
| `src/.../plugins/` | Plugin system — Phase 6+ |
| `examples/plugins/cao-discord/` | Discord plugin |
| `test/` | Python tests — we write our own in vitest |
| `skills/cao-plugin/` | Plugin authoring guide |

### Key adaptation notes

- **tmux → execa**: CAO manages agents in tmux panes and reads output via `tmux capture-pane`. We use `execa` to spawn subprocesses and read stdout/stderr directly. Claude Code's `--print` flag makes this clean.
- **Python → TypeScript**: All models/services re-implemented in TS with Zod schemas.
- **Apache 2.0 NOTICE**: Must include NOTICE file per Apache 2.0 requirements. Copy `external/cao/NOTICE` to `LICENSES/cao-NOTICE.txt`.
- **Attribution header** required: `/* Logic ported from awslabs/cli-agent-orchestrator@1f2a048, Apache-2.0. See LICENSES/cao-LICENSE.txt */`

---

## 4. mksglu/context-mode

- Pinned commit: `f00a1ab`
- License: **Elastic License 2.0 (ELv2)** — ⚠️ CANNOT copy or derive code
- Language: TypeScript
- Action: **Study pattern only** — understand design, build equivalent from scratch

### What to study (do NOT copy)

| Upstream area | What to learn |
|---|---|
| `src/security.ts` | Command allow/deny/ask evaluation engine. Chained command splitting (`&&`, `\|\|`, `;`, `\|`). Glob-to-regex for both command patterns and file paths. Symlink-escape prevention via `realpathSync`. Use as design spec — build equivalent in `packages/governor/src/policy.ts` from scratch. |
| `src/adapters/base.ts` | Agent adapter abstraction pattern. Per-agent hook registration. |
| `src/adapters/claude-code/` | How to inject context into Claude Code via hooks. `sessionstart` hook pattern. |
| `src/session/db.ts` | SQLite schema for session storage. `sessions`, `tool_calls`, `snapshots` table design. |
| `src/session/extract.ts` | How to extract structured data from agent session JSON output. |
| `src/store.ts` | Key-value store abstraction over SQLite. |
| `src/truncate.ts` | Content truncation to token budget. |
| `hooks/core/routing.mjs` | Tool-call routing/interception pattern via Claude Code hooks. |

### Files to NEVER copy

Everything in this repo. ELv2 prohibits competing use without a commercial license.

### Build-from-scratch equivalents

| context-mode pattern | Our equivalent (built from scratch) |
|---|---|
| `src/security.ts` command evaluator | `packages/governor/src/policy.ts` — same design, independent implementation |
| `src/session/db.ts` | `packages/memory/src/session-store.ts` — SQLite session layer |
| `src/store.ts` | `packages/memory/src/kv-store.ts` — KV store |
| `src/truncate.ts` | `packages/core/src/truncate.ts` — token-budget truncation |
| Hook injection pattern | `packages/core/src/hooks.ts` — agent hook registration |

---

---

## 5. Phase 5 — CAO Provider Study (Task 5.1)

> Detailed findings from reading `external/cao/src/cli_agent_orchestrator/providers/` (commit `1f2a048`).

### 5.1 Claude Code provider (`claude_code.py`)

**Subprocess command:**
```
claude --dangerously-skip-permissions [--model <name>] [--append-system-prompt <text>]
       [--mcp-config '{"mcpServers":{...}}'] [--disallowedTools <tool> ...]
```
- Unset parent `CLAUDE*` env vars before spawning (prevent nested-session errors).
- Inject `CAO_TERMINAL_ID` into every MCP server's `env` block.
- System prompt: newlines escaped as `\n` before passing to `--append-system-prompt`.

**MCP config format (passed to `--mcp-config`):**
```json
{
  "mcpServers": {
    "coderelay": {
      "type": "stdio",
      "command": "node",
      "args": ["/abs/path/to/packages/mcp-server/dist/index.js"],
      "env": { "CODERELAY_DB": ".coderelay/graph.db" }
    }
  }
}
```

**Tool restriction:** `--disallowedTools <native-tool-name>` (repeatable). CAO tool vocabulary (`execute_bash`, `fs_read`, `fs_write`, `fs_list`) maps to Claude Code native tool names (`Bash`, `Read`, `Edit`/`Write`, `Glob`/`Grep`).

**Output handling in our implementation:** Use `execa` with `--print` flag to get non-interactive output on stdout. Not tmux (tmux = CAO's interactive approach; we use subprocess pipes).

### 5.2 Gemini CLI provider (`gemini_cli.py`)

**Subprocess command:**
```
cd <workspace> && gemini --yolo [--model <name>] [-i "<role-acknowledgment>"]
```
- **No** `--mcp-config` CLI flag — writes MCP servers to `~/.gemini/settings.json`.
- System prompt goes in `GEMINI.md` file at workspace root (not a CLI flag).
- Run from isolated per-task workspace dir so Gemini picks up its `GEMINI.md`.

**MCP registration (writes to `~/.gemini/settings.json`):**
```json
{
  "mcpServers": {
    "coderelay": {
      "command": "node",
      "args": ["/abs/path/packages/mcp-server/dist/index.js"],
      "env": {}
    }
  }
}
```

**Tool restriction:** TOML policy files at `~/.gemini/policies/coderelay-<taskId>.toml` with `[[rule]] decision = "deny"` entries. Clean up after task.

**Trusted folders:** Pre-register workspace in `~/.gemini/trustedFolders.json` before launch.

### 5.3 Tool mapping (for our TS implementation)

| CAO vocabulary | Claude Code native | Gemini CLI native |
|---|---|---|
| `execute_bash` | `Bash` | `run_shell_command` |
| `fs_read` | `Read` | `read_file`, `list_directory`, `search_file_content`, `glob` |
| `fs_write` | `Edit`, `Write` | `write_file`, `replace` |
| `fs_list` | `Glob`, `Grep` | `list_directory`, `glob`, `search_file_content` |
| `*` (wildcard) | unrestricted | unrestricted |

### 5.4 What we skip vs port

**Port to TS:**
- Tool mapping table (see above) → `packages/sub-agents/src/utils/tool-mapping.ts`
- MCP config generation → inline in `packages/sub-agents/src/providers/`
- `execa` subprocess wrapper (not tmux) → `packages/sub-agents/src/runner.ts`

**Skip:**
- `tmux.py` — replaced by `execa` piped streams
- All providers except claude_code + gemini_cli (codex, kiro, kimi, q, opencode, copilot)
- FastAPI REST layer, web dashboard
- Plugin system

---

## Summary: Phase-by-Phase Porting Schedule

| Phase | Upstream files ported |
|---|---|
| Phase 2 (Indexer) | claude-context: `ast-splitter`, `merkle`, `synchronizer`, WASM files. graphify: `extract`, `detect`, `cache`, `build` logic. |
| Phase 3 (Memory) | claude-context: `snapshot`, embedding providers. context-mode patterns: session store, KV store. |
| Phase 4 (MCP Server) | claude-context: `handlers`, `config`, `utils`, `index` (mcp package). cao: MCP tool shapes. |
| Phase 5 (Sub-Agents) | cao: `base` provider, `claude_code` provider, `gemini_cli` provider, session service, tool mapping. |
| Phase 6 (Governor) | context-mode patterns (no copy): policy engine, blocklist, sanitizer — all built from scratch. |
