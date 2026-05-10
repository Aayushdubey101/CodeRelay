# CodeRelay

> CLI orchestrator that wraps Claude Code, Gemini CLI, and Cursor with a shared **codebase graph**, **tiered memory**, and **governance layer** — cutting token usage by ≥60% and eliminating re-reads of your repo.

## Quick Start

```bash
npm install -g coderelay

# 1. Initialize config (auto-detects project type)
coderelay init

# 2. Index your repo
coderelay index .

# 3. Run a task
coderelay run "rename UserService.email to UserService.primaryEmail everywhere"

# 4. Check what happened
coderelay status && coderelay log

# 5. Rollback if needed
coderelay rollback <task-id>
```

Requires Node ≥ 20. At least one of: Ollama locally, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`.

## How it works

```
Your task → CodeRelay → Plan → Retrieve context → Sub-agent → Verify → Re-align → Done
```

- **Codebase graph** — tree-sitter AST → SQLite graph + LanceDB vectors. Sub-agents read zero raw files.
- **Tiered memory** — working (RAM) / session (SQLite) / long-term (SQLite+LanceDB). Decisions persist across sessions.
- **Governance** — hard-coded destructive blocklist, secret scanner, injection sanitizer, worktree sandbox, rollback.
- **LLM router** — Ollama for embeddings/summarization, Claude/Gemini for planning/code-gen. Configurable.

## Commands

| Command | Description |
|---------|-------------|
| `coderelay init` | Create `coderelay.yaml` (auto-detects project type) |
| `coderelay index <path>` | Index source files into code graph |
| `coderelay run <prompt>` | Run a task via sub-agent |
| `coderelay run-tui <prompt>` | Same, with live TUI (plan + step + tokens) |
| `coderelay plan <task>` | Show execution plan without running |
| `coderelay status` | Show recent orchestrator activity |
| `coderelay log [--task <id>]` | Show action log |
| `coderelay rollback <task-id>` | Revert a task |
| `coderelay graph stats` | Code graph statistics |
| `coderelay search <query>` | Search indexed chunks |
| `coderelay context <query>` | Show context chunks for a query |
| `coderelay explain <query>` | Explain context retrieval reasoning |
| `coderelay remember <text>` | Save fact to long-term memory |
| `coderelay recall <query>` | Search long-term memory |
| `coderelay cost` | Detailed token cost breakdown |
| `coderelay usage --today` | Token usage summary |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CODERELAY                                │
│  Indexer ──► SQLite graph + LanceDB vectors                     │
│  Memory  ──► Working / Session / Long-term                      │
│  Governor ──► Blocklist + Policy + Sandbox + Scanner            │
│  Router  ──► Anthropic / OpenAI / Gemini / Ollama              │
│                                                                 │
│  Plan → Retrieve → Execute → Verify → Re-align → (loop)        │
│                        │                                        │
│                   MCP stdio bridge                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
    Claude Code       Gemini CLI          Cursor / Editor
```

## Configuration

`coderelay init` generates a starter `coderelay.yaml`. Full reference: [docs/configuring.md](docs/configuring.md).

```yaml
version: 1
project:
  type: typescript
router:
  defaultProvider: ollama
routing:
  plan: anthropic
  code-gen: anthropic
  embed: ollama
```

## Safety

Hard-coded (never user-configurable) destructive blocklist: `rm -rf`, `DROP TABLE/DATABASE`, `git push --force`, fork bombs, and more. Full details: [docs/safety.md](docs/safety.md).

## Built on open source

| Upstream | License | Used for |
|---------|---------|---------|
| [zilliztech/claude-context](https://github.com/zilliztech/claude-context) | MIT | MCP scaffold, AST chunker, Merkle indexer |
| [safishamsi/graphify](https://github.com/safishamsi/graphify) | MIT | Tree-sitter symbol/call extraction |
| [awslabs/cli-agent-orchestrator](https://github.com/awslabs/cli-agent-orchestrator) | Apache 2.0 | Sub-agent provider patterns |

Full attribution: [NOTICE.md](NOTICE.md). License files: [LICENSES/](LICENSES/).

## License

MIT — see [LICENSE](LICENSE).
