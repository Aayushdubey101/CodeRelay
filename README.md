# CodeRelay

> CLI orchestrator that wraps Claude Code and Gemini CLI with a shared **codebase graph**, **tiered memory**, and **governance layer** — cutting token usage by ≥60% and eliminating re-reads of your repo.

## Install

```bash
npm install -g coderelay
```

Requires Node ≥ 20. At least one agent: Claude Code or Gemini CLI.

---

## First Time Setup

```bash
# 1. System check
coderelay setup

# 2. Configure your AI providers
coderelay auth

# 3. Go to your project
cd your-project

# 4. Initialize CodeRelay
coderelay init

# 5. Start working
coderelay ask
```

---

## How It Works
```
You
↓
coderelay ask
↓
Planner → breaks task into steps
↓
Retriever → finds only relevant files (graph + vector search)
↓
Agent (Claude Code / Gemini) → works with minimal context only
↓
Verifier → typechecks + runs affected tests
↓
Re-aligner → replans if drift detected
↓
Memory → saves decisions for next session
```

Without CodeRelay: agent reads 200 files to find 5 relevant ones.  
With CodeRelay: agent gets exactly the 5 files it needs.  
**Result: ~60% fewer tokens. Same output. Less cost.**

---

## Token Savings

| Scenario | Without CodeRelay | With CodeRelay | Saved |
|----------|-------------------|----------------|-------|
| 10k line repo, small task | ~50,000 tokens | ~8,000 tokens | ~84% |
| 50k line repo, refactor | ~200,000 tokens | ~25,000 tokens | ~87% |
| Greenfield project (7 files) | ~4,200 tokens | ~2,400 tokens | ~43% |
| Cross-module feature | ~80,000 tokens | ~18,000 tokens | ~77% |

Savings scale with codebase size. Larger repo = more savings.

---

## Commands

### Setup
| Command | Description |
|---------|-------------|
| `coderelay setup` | Check system dependencies, create global config |
| `coderelay auth` | Configure AI provider keys interactively |

### Project
| Command | Description |
|---------|-------------|
| `coderelay init` | Initialize project — analysis, context, memory, problem scan |
| `coderelay index <path>` | Index source files into code graph |
| `coderelay ask` | Interactive prompt loop — plan, confirm, run |

### Tasks
| Command | Description |
|---------|-------------|
| `coderelay run <prompt>` | Run a task via orchestrator |
| `coderelay run --agent gemini <prompt>` | Run via Gemini CLI |
| `coderelay run --file task.md` | Read task from file |
| `coderelay run --budget 50000 <prompt>` | Run with custom token budget |
| `coderelay run-tui <prompt>` | Run with live terminal UI |
| `coderelay plan <task>` | Show plan without running |
| `coderelay rollback <task-id>` | Undo a task completely |

### Memory
| Command | Description |
|---------|-------------|
| `coderelay remember <text>` | Save fact to long-term memory |
| `coderelay recall <query>` | Search long-term memory |
| `coderelay status` | Recent activity summary |
| `coderelay log` | Full action log |
| `coderelay log --task <id>` | Log for one specific task |

### Analysis
| Command | Description |
|---------|-------------|
| `coderelay search <query>` | Search indexed code |
| `coderelay context <query>` | Preview context retrieval |
| `coderelay explain <query>` | Why was this context chosen |
| `coderelay graph stats` | Code graph statistics |
| `coderelay debug <log-file>` | AI-powered log diagnosis |
| `coderelay quality` | Complexity, duplication, SOLID report |

### Cost
| Command | Description |
|---------|-------------|
| `coderelay usage --today` | Today's token usage by provider |
| `coderelay cost` | Full cost breakdown by model |

### Team
| Command | Description |
|---------|-------------|
| `coderelay team init --shared-db <path>` | Setup encrypted shared memory |
| `coderelay team status` | Show shared team facts |

### Other
| Command | Description |
|---------|-------------|
| `coderelay dashboard` | Start web UI at localhost:4242 |
| `coderelay daemon` | Start IPC daemon for VSCode extension |
| `coderelay migrate` | Create or migrate graph DB schema |

---

## Supported AI Providers

| Provider | Type | Best for |
|----------|------|----------|
| Anthropic (Claude) | Cloud | Planning, code generation |
| OpenAI (GPT) | Cloud | Planning, code generation |
| Google (Gemini) | Cloud | Planning, code generation |
| OpenRouter | Cloud | Any model via single API |
| Ollama | Local | Embeddings, summarization (free) |
| LM Studio | Local | Any locally loaded model (free) |

Configure all providers interactively via `coderelay auth`.  
Cheap tasks (embeddings, summaries) route to local models automatically — reducing cloud spend further.

---

## Full Workflow Example

```bash
# First time on a new machine
coderelay setup
coderelay auth

# Start a project
cd my-express-api
coderelay init

# CodeRelay will:
# Phase 1 — analyse project structure, languages, frameworks
# Phase 2 — understand what the project does (LLM summary)
# Phase 3 — initialise memory DBs, index codebase
# Phase 4 — identify existing problems (complexity, secrets, missing files)

# Work on a task
coderelay ask

# > What do you want to build or fix?
# > add input validation to POST /users endpoint
#
# Thinking...
#
# Plan:
#   Step 1 — find POST /users handler       → routes/users.js
#   Step 2 — add validation middleware       → middleware/validate.js
#   Step 3 — update route to use middleware  → routes/users.js
#   Step 4 — update tests                   → tests/users.test.js
#
# Proceed? [Y/n/edit] Y
# Which agent? (1) Claude Code  (2) Gemini CLI  (3) Both parallel
# > 1
#
# [live TUI shows progress, token counter, files being read]
#
# Task complete.
#   Files changed : 3
#   Tokens used   : 4,231
#   Cost          : $0.0048
#   Branch        : coderelay/task-a1b2c3
#
# Merge to main? [y/N] y
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          CODERELAY                              │
│                                                                 │
│  Indexer  ──► SQLite graph + LanceDB vectors                    │
│  Memory   ──► Working (RAM) / Session (SQLite) / Long-term      │
│  Governor ──► Blocklist + Policy + Sandbox + Secret scanner     │
│  Router   ──► Anthropic / OpenAI / Gemini / OpenRouter          │
│               Ollama / LM Studio                                │
│  Monitor  ──► Real-time token tracking + scope validation       │
│                                                                 │
│  Plan ──► Retrieve ──► Execute ──► Verify ──► Re-align ──► loop │
│                            │                                    │
│                       MCP stdio bridge                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
         Claude Code                   Gemini CLI
```

### Packages

| Package | Purpose |
|---------|---------|
| `core` | Shared logger (Pino) |
| `indexer` | Tree-sitter AST parsing, SQLite graph, LanceDB vectors |
| `memory` | 3-tier memory system + team AES-256 encryption |
| `router` | Multi-provider LLM abstraction + retry + circuit breaker |
| `governor` | Safety layer — blocklist, sanitizer, secret scanner, worktree |
| `mcp-server` | MCP stdio server exposing 10 tools to sub-agents |
| `sub-agents` | Claude Code + Gemini CLI subprocess wrappers |
| `orchestrator` | Plan→Retrieve→Execute→Verify→Realign conductor |
| `debugger` | Log file + stack trace AI root cause analysis |
| `quality` | Cyclomatic complexity, duplication, SOLID violation checks |
| `dashboard` | Express web UI — graph browser + memory viewer + live log |
| `cli` | Main `coderelay` binary — all user-facing commands |

---

## Configuration

`coderelay init` auto-generates `coderelay.yaml` based on detected project type.

```yaml
version: 1
project:
  name: my-project
  type: typescript

router:
  defaultProvider: ollama

routing:
  plan: anthropic
  code-gen: anthropic
  summarize: ollama
  embed: ollama

orchestrator:
  max_realign_attempts: 3
  token_budget: 100000

sandbox:
  worktree: true

lmstudio:
  host: localhost:1234
  model: auto
```

Full config reference: [docs/configuring.md](docs/configuring.md)

---

## Safety

Always-on. Never user-configurable. Cannot be disabled.

| Protection | What it blocks |
|------------|---------------|
| Destructive blocklist | `rm -rf`, `DROP TABLE`, `DROP DATABASE`, `git push --force`, fork bombs, `mkfs`, `dd if=`, and 15+ more |
| Secret scanner | AWS keys, GitHub PATs, Anthropic/OpenAI/Google/Stripe/Slack tokens, JWT tokens, private key headers |
| Prompt injection blocker | "ignore previous instructions", persona injection, role override, embedded tool calls, jailbreak phrases |
| Git worktree sandbox | Every task runs in isolated branch — main branch never touched until you approve merge |
| One-command rollback | `coderelay rollback <id>` removes branch and undoes every change |
| Action log | Append-only JSONL record of every action ever taken — basis for rollback |

Full details: [docs/safety.md](docs/safety.md)

---

## MCP Tools

CodeRelay exposes 10 tools to sub-agents via MCP protocol. Instead of reading raw files, agents use:

| Tool | What it does |
|------|-------------|
| `get_relevant_context` | Hybrid vector + graph search, returns ranked chunks |
| `get_symbol` | Definition + signature of any function or class |
| `get_callers` | Who calls this function (graph traversal) |
| `get_callees` | What this function calls |
| `get_file_summary` | Cached LLM summary of a file |
| `search_semantic` | Vector similarity search |
| `find_similar_code` | Find code doing similar things |
| `get_dependency_tree` | Full import/dependency tree |
| `recall_fact` | Query long-term memory |
| `record_decision` | Write architectural decision to PROJECT.md |

This is the core token reduction mechanism — agents never read a full file when they can ask for just the function they need.

---

## VSCode Extension

```bash
coderelay daemon   # start IPC server first
```

Install from `extensions/vscode/`. Provides:
- Sidebar tree view — live plan steps with status (pending / running / done / failed)
- Context manifest panel — exactly which files Claude is reading and why, with token counts

---

## Team Mode

```bash
# One person sets up shared DB (git repo, shared drive, etc.)
coderelay team init --shared-db /shared/team.db

# Everyone sets passphrase via env var (never stored)
export CODERELAY_TEAM_PASSPHRASE=your-passphrase

# Check shared knowledge
coderelay team status
```

- AES-256-GCM encryption — keys derived via scrypt, never stored
- Content-hash deduplication — same fact never stored twice
- All teammates read each other's saved architectural decisions automatically

---

## Built on Open Source

| Upstream | License | Used for |
|---------|---------|---------|
| [zilliztech/claude-context](https://github.com/zilliztech/claude-context) | MIT | MCP scaffold, AST chunker, Merkle indexer |
| [safishamsi/graphify](https://github.com/safishamsi/graphify) | MIT | Tree-sitter symbol/call extraction patterns |
| [awslabs/cli-agent-orchestrator](https://github.com/awslabs/cli-agent-orchestrator) | Apache 2.0 | Sub-agent provider patterns |

Full attribution: [NOTICE.md](NOTICE.md). All license files: [LICENSES/](LICENSES/).

---

## Requirements

- Node.js ≥ 20
- pnpm (for development)
- git
- At least one of:
  - Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
  - Gemini CLI (`npm install -g @google/gemini-cli`)
- At least one AI provider:
  - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` or `GEMINI_API_KEY`
  - Or Ollama / LM Studio running locally (free)

---

## License

MIT — see [LICENSE](LICENSE).
