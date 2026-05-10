# CodeRelay — Complete Project Summary

---

## What Problem Does This Solve?

When you use AI coding assistants like Claude Code or Gemini CLI on a large codebase, they read enormous amounts of code every single time you give them a task. A 10,000-line project means the AI might scan 200+ files just to find the 5 files it actually needs. This wastes:

- **Money** — every token costs real money (Claude charges per input token)
- **Time** — larger context = slower responses
- **Accuracy** — more irrelevant context = more hallucinations

**CodeRelay fixes this.** It acts as a smart middleman. It indexes your codebase once, understands the structure deeply, and when you give it a task, it hands Claude only the exact files and functions it needs — nothing more.

**Result: ~60% fewer tokens used. Same quality output. Less cost. Faster.**

---

## What Is CodeRelay?

CodeRelay is a **CLI tool** (command-line application) that wraps AI coding agents. You run your coding tasks through CodeRelay instead of directly through Claude Code or Gemini CLI.

It sits between you and the AI:

```
You
 ↓
CodeRelay  ←→  Your Codebase Database (SQLite)
 ↓
Claude Code / Gemini CLI  ←→  Only the relevant code
 ↓
Result
```

It is built in **TypeScript**, runs on **Node.js**, and uses a **pnpm monorepo** (multiple packages in one repository).

---

## Tech Stack

| What | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 20 LTS |
| Package manager | pnpm workspaces (monorepo) |
| Code graph DB | SQLite via better-sqlite3 |
| Vector search | LanceDB (embedded, no server needed) |
| AST parsing | web-tree-sitter (WASM, no native deps) |
| AI integration | MCP protocol (Model Context Protocol) |
| Logging | Pino (JSON in prod, pretty in dev) |
| Validation | Zod schemas |
| Tests | Vitest |
| CLI UI | Ink (React for terminal) |
| Process management | execa |

---

## Repository Structure

```
CodeRelay/
├── packages/
│   ├── core/          — Shared types, logger (used by all packages)
│   ├── indexer/       — Scans codebase, extracts symbols, stores in SQLite + LanceDB
│   ├── memory/        — 3-tier memory system (working / session / long-term)
│   ├── router/        — LLM abstraction (Anthropic, OpenAI, Gemini, Ollama)
│   ├── governor/      — Safety layer (policy, blocklist, sandbox, secret scanner)
│   ├── mcp-server/    — MCP stdio server exposing 10 tools to sub-agents
│   ├── sub-agents/    — Claude Code + Gemini CLI subprocess wrappers
│   ├── orchestrator/  — Plan → Retrieve → Execute → Verify → Re-align loop
│   ├── debugger/      — AI-powered log file / stack trace analyzer
│   ├── quality/       — Code quality checker (complexity, duplication, SOLID)
│   ├── dashboard/     — Web UI for knowledge graph + memory viewer
│   └── cli/           — The main `coderelay` binary (all user-facing commands)
├── extensions/
│   └── vscode/        — VSCode extension (sidebar plan view + context panel)
├── benchmarks/        — Performance benchmarks
├── docs/              — Architecture, config guide, safety docs
├── external/          — Git submodules of open-source projects used for reference
└── LICENSES/          — License files for all upstream open-source code used
```

---

## How It Works — The Full Pipeline

### 1. Indexing Phase (done once)

You run `coderelay index .` on your project. CodeRelay:
- Walks every source file (TypeScript, JavaScript, Python, Go, Rust, Java, C/C++)
- Uses tree-sitter to parse AST (Abstract Syntax Tree) — extracts every function, class, variable, import
- Builds a **code graph** in SQLite: files → symbols → edges (who calls what, who imports what)
- Creates **vector embeddings** of every code chunk, stored in LanceDB for semantic search
- Uses Merkle-tree diffing so future re-indexes only process changed files

After indexing, CodeRelay knows your entire codebase structure without reading any file again.

### 2. Task Execution Phase

When you run `coderelay run "add caching to UserService"`:

**Step 1 — Plan**
The Planner LLM breaks the task into steps:
```
1. Find UserService class and its dependencies
2. Add cache interface
3. Implement cache layer
4. Update tests
```

**Step 2 — Retrieve**
For each step, the Retriever queries the code graph:
- Graph traversal: finds symbols related to `UserService`
- Vector search: finds semantically similar code chunks
- Budget enforcement: never exceeds your configured token limit
- Result: a minimal context manifest (exactly which files + functions are needed)

**Step 3 — Execute**
CodeRelay launches Claude Code (or Gemini) as a subprocess. It:
- Injects the MCP server so Claude uses CodeRelay tools instead of raw file reads
- Provides only the retrieved context (not the full codebase)
- Runs in an isolated git worktree branch (`coderelay/task-<id>`) — main branch is never touched

**Step 4 — Verify**
After execution:
- Runs type checker (`tsc`, `pyright`, `cargo check` depending on language)
- Runs only tests that touch changed symbols (graph-aware test selection)
- Checks if changed files match expected files from the plan

**Step 5 — Re-align**
The planner checks if remaining steps still make sense given what was done. Replans if drift is detected.

**Step 6 — Memory Update**
Writes the outcome (decisions made, files changed) to long-term memory so future tasks in the same area have prior context automatically.

---

## Components In Detail

### Memory System (3 Tiers)

| Tier | Storage | Lifetime | Purpose |
|---|---|---|---|
| Working | RAM (Map) | One task | Scratchpad for current task |
| Session | SQLite | One terminal session | Conversation history, auto-summarized every 20 turns |
| Long-term | SQLite + LanceDB | Permanent | Facts, decisions, architecture notes |

Every memory read is logged to a **context manifest** — if the same context was loaded in a prior step, it is not loaded again. This prevents re-paying for the same tokens twice.

### LLM Router

Supports four providers:
- **Anthropic** (Claude models)
- **OpenAI** (GPT models)
- **Google** (Gemini models)
- **Ollama** (local, free, runs on your machine)

Tasks are tagged (`plan`, `code-gen`, `summarize`, `embed`, etc.) and routed to the cheapest model that meets the quality bar. You configure this in `coderelay.yaml`. Example: summaries go to Ollama (free), code generation goes to Claude Sonnet.

### Governor (Safety Layer)

Every sub-agent action passes through the governor before execution:

1. **Destructive blocklist** — hard-coded, cannot be disabled. Blocks: `rm -rf`, `DROP TABLE`, `DROP DATABASE`, `git push --force`, `chmod 777 -R`, fork bombs, `mkfs`, `dd if=`, and more.

2. **Permission policy** — YAML-configurable. Define which shell commands, file paths, and network endpoints are allowed.

3. **Git worktree sandbox** — every task runs in its own `coderelay/task-<id>` branch. Main is only updated if you explicitly approve. `coderelay rollback <id>` removes the branch entirely.

4. **Prompt injection sanitizer** — scans any external text before it reaches the LLM. Flags patterns like "ignore previous instructions", "system:", embedded tool calls.

5. **Secret scanner** — gitleaks-style rules. If your code contains AWS keys, GitHub tokens, or other secrets, they are masked before being sent to any AI provider.

6. **Action log** — append-only JSONL file recording every single action. Basis for rollback.

### MCP Server

Claude Code and Gemini CLI connect to CodeRelay's MCP (Model Context Protocol) server as a plugin. Instead of the AI using raw `Read`/`Grep` file operations, it uses CodeRelay's tools:

| Tool | What It Does |
|---|---|
| `get_relevant_context` | Hybrid vector + graph search, returns ranked chunks |
| `get_symbol` | Definition + signature of any function/class |
| `get_callers` | Who calls this function (graph traversal) |
| `get_callees` | What this function calls |
| `get_file_summary` | Cached LLM summary of a file |
| `search_semantic` | Vector similarity search |
| `find_similar_code` | Find code doing similar things |
| `get_dependency_tree` | Full import/dependency tree |
| `recall_fact` | Query long-term memory |
| `record_decision` | Write architectural decision to PROJECT.md |

This is the core mechanism for token reduction — the AI never reads a full file when it can ask for just the function it needs.

---

## Phase 10 Features (Advanced)

### Runtime Debugger Agent
```
coderelay debug error.log
```
Parses any log file or stack trace. Extracts error entries, identifies stack frames, sends to AI for root cause analysis. Returns: summary, root cause, specific fix suggestions, affected files, severity (critical/high/medium/low).

### Design Quality Verifier
```
coderelay quality .
```
Three checks:
- **Cyclomatic complexity** — counts branches per function. Flags anything above threshold (default: 15)
- **Code duplication** — rolling 8-line hash windows across all files. Reports duplicate line rate
- **SOLID violations** — heuristic checks: files too large (SRP), switch-on-type patterns (OCP), interfaces too large (ISP), `new ConcreteClass()` inside constructors (DIP)

### Multi-Agent Coordination
When a task has independent steps (different files, no overlap), CodeRelay dispatches them in parallel:
- Code generation tasks → Claude
- Search/research tasks → Gemini
- Non-overlapping file edits → both run simultaneously via `Promise.all`

### VSCode Extension
Located in `extensions/vscode/`. Requires running `coderelay daemon` in terminal first. Provides:
- **Sidebar tree view** — live plan steps with status icons (pending/running/done/failed)
- **Context manifest panel** — table showing exactly which files Claude is reading and why, with token counts. Auto-refreshes every 5 seconds.

### Web Dashboard
```
coderelay dashboard --port 4242
```
Opens at `http://localhost:4242`. Shows:
- Code graph stats (files, symbols, edges, chunks)
- Long-term memory facts
- Live action log stream (Server-Sent Events, updates in real time)

### Team Mode
```
coderelay team init --shared-db /shared/drive/team.db
coderelay team status
```
Encrypted shared memory across your entire development team:
- AES-256-GCM encryption (military-grade)
- Key derived from passphrase via scrypt (never stored)
- Content-hash deduplication (same fact not stored twice)
- Each developer reads all teammates' saved facts automatically

---

## Installation & First Run

### Prerequisites
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- At least one AI provider API key (Anthropic, OpenAI, or Gemini) OR Ollama running locally

### Setup
```bash
git clone <repo>
cd CodeRelay
pnpm install
pnpm -r build
```

### Configure
```bash
coderelay init          # auto-detects project type, writes coderelay.yaml
```
Set your API key as environment variable:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
# or
export GEMINI_API_KEY=...
```

### Index your project
```bash
coderelay index .
```
Takes 30–120 seconds depending on codebase size. Run once, then only re-run when code changes significantly.

### Run your first task
```bash
coderelay run "add input validation to the login endpoint"
```

---

## All Commands Reference

| Command | Description |
|---|---|
| `coderelay index <path>` | Index codebase into graph DB |
| `coderelay run "task"` | Run task via Claude Code |
| `coderelay run --agent gemini "task"` | Run via Gemini CLI |
| `coderelay plan "task"` | Show execution plan without running |
| `coderelay status` | Recent activity summary |
| `coderelay log` | Full action log (all tasks) |
| `coderelay log --task <id>` | Log for one specific task |
| `coderelay rollback <taskId>` | Undo a task completely |
| `coderelay search "query"` | Search indexed code by keyword |
| `coderelay context "query"` | Preview what context would be retrieved |
| `coderelay explain "query"` | Why was specific context chosen |
| `coderelay remember "fact"` | Save fact to long-term memory |
| `coderelay recall "query"` | Search long-term memory |
| `coderelay usage --today` | Token usage and cost report |
| `coderelay cost` | Detailed cost breakdown by provider/model |
| `coderelay graph stats` | Code graph statistics |
| `coderelay migrate` | Create/migrate graph DB schema |
| `coderelay init` | Create coderelay.yaml config |
| `coderelay debug <log-file>` | AI-powered log/stack trace analysis |
| `coderelay quality [path]` | Code quality report |
| `coderelay dashboard` | Start web UI at localhost:4242 |
| `coderelay daemon` | Start IPC daemon (needed for VSCode extension) |
| `coderelay team init --shared-db <path>` | Initialize team mode |
| `coderelay team status` | Show team sync status + recent facts |
| `coderelay run-tui "task"` | Run with live terminal UI |

---

## Benefits Summary

| Problem | How CodeRelay Solves It |
|---|---|
| High token costs | Retrieves only relevant context (~60% reduction) |
| Slow AI responses | Smaller context = faster completions |
| AI reads wrong files | Graph + vector search finds exact relevant symbols |
| Dangerous AI actions | Governor blocks destructive commands always |
| Secrets leaked to AI | Secret scanner masks before sending |
| AI breaks main branch | Every task in isolated git worktree |
| No undo for AI changes | Action log + rollback command |
| Context lost between sessions | 3-tier memory persists decisions |
| Team has no shared knowledge | Encrypted team memory database |
| Debugging logs manually | AI debugger agent automates root cause |
| Code quality drift | Quality verifier catches complexity + duplication |

---

## Open Source Attribution

CodeRelay builds on top of these MIT/Apache 2.0 open-source projects:

| Project | Used For |
|---|---|
| `zilliztech/claude-context` | MCP scaffold, AST chunker, Merkle indexer |
| `safishamsi/graphify` | Tree-sitter symbol + call graph extraction patterns |
| `awslabs/cli-agent-orchestrator` | Sub-agent spawning patterns |
| `mksglu/context-mode` | MCP sandboxing pattern study |

All licenses in `LICENSES/`. Full attribution in `NOTICE.md`.

---

## Current Status

All 10 phases complete as of 2026-05-10:
- 12 TypeScript packages, all typecheck clean
- 281 automated tests passing
- VSCode extension builds and typechecks clean
- Benchmarks show 60%+ token reduction on reference repos
- v0.1.0 publish-ready
