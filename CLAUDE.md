# CodeRelay — Claude Code Project Config

## Session Resume

**Always read in order before touching code:**
1. `work.md` — master checklist (ticked = done)
2. `prompt.md` — CURRENT TASK block + phase pointer
3. `docs/journal.md` — recent blockers
4. `docs/architecture.md` — invariants you must not break

## What This Project Is

CLI orchestrator wrapping Claude Code / Gemini CLI / Cursor with shared codebase graph, memory, and governance. Goal: ≥60% token reduction vs raw Claude Code.

**Strategy:** Fork & integrate MIT/Apache open-source (≥60% reuse). Differentiators: tiered memory, per-step alignment loop, governance layer.

## Package Map

```
packages/
  core/          — shared types, logger (Pino)
  indexer/       — tree-sitter AST + SQLite graph + LanceDB vectors
  memory/        — working / session / long-term tiers
  router/        — LLM provider abstraction (Anthropic/OpenAI/Gemini/Ollama)
  governor/      — policy engine + destructive blocklist + sanitizer + sandbox
  mcp-server/    — MCP stdio server (10 tools, 3 resources, 3 prompt templates)
  sub-agents/    — Claude Code / Gemini CLI subprocess wrappers
  orchestrator/  — Plan → Retrieve → Execute → Verify → Re-align loop
  cli/           — Ink TUI binary, all user-facing commands
```

## Phase Status (2026-05-10)

- [x] 0 Setup & Reuse Audit
- [x] 1 LLM Router
- [x] 2 Indexer + Code Graph
- [x] 3 Memory System
- [x] 4 MCP Server
- [x] 5 Sub-Agent Wrapping
- [x] 6 Governance Layer
- [ ] **7 Orchestrator Loop** ← CURRENT
- [ ] 8 TUI + DX
- [ ] 9 Benchmarks + Release

Current task: see `prompt.md` CURRENT TASK block.

## Hard Rules

- **Never import a provider SDK directly** — all LLM calls go through `@coderelay/router`.
- **Destructive blocklist is hard-coded** in `packages/governor/src/blocklist.ts` — never user-configurable.
- **Every memory read logged** to context manifest (`packages/memory/src/manifest.ts`).
- **Sub-agent never runs outside governor sandbox.**
- **Every copied upstream file** gets header: `/* Adapted from <repo>@<sha>, MIT/Apache. See LICENSES/<repo>-LICENSE.txt */`
- Use `pnpm`, not `npm`. TypeScript strict mode. Run `pnpm tsc --noEmit` before declaring done.
- Do NOT start Phase 8+ work while Phase 7 tasks are open in `work.md`.

## Tech Stack (locked-in)

| Layer | Choice |
|-------|--------|
| Runtime | TypeScript + Node 20 LTS, pnpm workspaces |
| AST | web-tree-sitter (WASM) |
| Graph | SQLite (better-sqlite3), WAL mode |
| Vectors | LanceDB (embedded, replaces upstream's Milvus) |
| MCP | `@modelcontextprotocol/sdk` stdio transport |
| Process | execa |
| Logging | Pino (pretty dev, JSON prod) |
| Tests | Vitest (`vitest.config.ts` excludes `external/`) |
| Validation | Zod |

## Upstream Submodules (read-only)

```
external/claude-context/   MIT  — MCP scaffold, chunker, Merkle indexer
external/graphify/         MIT  — tree-sitter symbol/call extraction
external/cao/              Apache 2.0 — sub-agent spawning patterns
external/context-mode/     ELv2 — study only, do NOT copy code
```

License files in `LICENSES/`. Attribution in `NOTICE.md`.

## Key Commands

```bash
pnpm -r build            # build all packages
pnpm tsc --noEmit        # typecheck (run before "done")
pnpm test                # vitest
pnpm run -r typecheck    # strict typecheck all packages
coderelay index <path>   # index a repo
coderelay run --agent claude "task"   # run sub-agent
coderelay usage --today  # token cost summary
coderelay remember "fact"
coderelay recall "query"
coderelay rollback <task-id>
```

## Architecture Invariants (do not break)

1. Sub-agent reads zero raw files when CodeRelay graph can answer — this is how we cut tokens.
2. Three memory tiers must stay separate: working (RAM), session (SQLite), long-term (SQLite+LanceDB).
3. Every prompt assembly logged to context manifest — prevents re-loading same context twice.
4. Orchestrator loop: Plan → Retrieve → Execute → Verify → Re-align → (loop or done).
5. Worktree sandbox: every task runs in `coderelay/task-<id>` branch; merge to main only on approval.
