# Next-Session Prompt (`prompt.md`)

> **What this file is:** Paste the contents of the **Paste-Into-Claude-Code Block** below into Claude Code at the start of every new session. It tells the agent (a) what's been done, (b) what to do next, (c) what rules to follow.
> **How to maintain:** At the end of every session, edit the **CURRENT TASK** and **DONE THIS SESSION** sections. Tick the matching box in `work.md`. Bump the **Phase Pointer**.

---

## 🟢 Phase Pointer

**Currently on:** Phase 0 — Setup & Reuse Audit
**Next concrete task:** `0.7 Logging (Pino)`

> When phase finishes, update this pointer + tick all phase boxes below.

### Phase Tick-Off
- [ ] Phase 0 — Setup & Reuse Audit
- [ ] Phase 1 — LLM Router
- [ ] Phase 2 — Indexer + Code Graph
- [ ] Phase 3 — Memory System
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
ID:        0.7
Title:     Logging (Pino)
From:      work.md → Phase 0 → 0.7
Acceptance: `import { log } from "@coderelay/core"; log.info("hi")` prints.
Sub-steps:
  1. Add pino + pino-pretty to packages/core devDependencies
  2. Create packages/core/src/logger.ts — exports `log` (pino instance)
     - dev: pretty transport (human-readable)
     - prod: JSON (NODE_ENV=production)
     - name field = "@coderelay/core"
  3. Re-export log from packages/core/src/index.ts
  4. Add a smoke test: packages/core/src/logger.test.ts — log.info("hi") doesn't throw
  5. Each other package adds pino dep + creates its own logger.ts (name = package name)
  6. Run pnpm -r typecheck → exits 0
  7. Commit: "feat: add Pino logging to all packages"

When 0.7 passes, update CURRENT TASK to Phase 1 (task 1.1) and STOP.
```

---

## 📅 DONE THIS SESSION

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
