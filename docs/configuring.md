# Configuring CodeRelay

Run `coderelay init` to generate a starter `coderelay.yaml`. This document describes every option.

## Full Reference

```yaml
version: 1    # config schema version, currently always 1

# ── Project ──────────────────────────────────────────────────────────
project:
  type: typescript   # typescript | python | rust | java | go | unknown
  rootDir: .         # project root relative to coderelay.yaml

# ── LLM Router ───────────────────────────────────────────────────────
router:
  defaultProvider: ollama   # used when a tag has no explicit routing rule

  providers:
    ollama:
      baseUrl: http://localhost:11434
      model: qwen2.5-coder:7b       # any model pulled in Ollama
    anthropic:
      model: claude-sonnet-4-6
      # apiKey read from ANTHROPIC_API_KEY env var
    openai:
      model: gpt-4o-mini
      # apiKey read from OPENAI_API_KEY env var
    gemini:
      model: gemini-1.5-flash
      # apiKey read from GEMINI_API_KEY env var

# ── Routing Rules ────────────────────────────────────────────────────
# Each tag routes to a provider. Available tags:
#   embed | summarize | classify | sanitize | plan | code-gen
routing:
  embed: ollama        # always cheap — vectors never need a frontier model
  summarize: ollama
  classify: ollama
  sanitize: ollama
  plan: anthropic      # planning needs strong reasoning
  code-gen: anthropic  # code generation needs frontier model

# ── Indexer ──────────────────────────────────────────────────────────
indexer:
  dbPath: .coderelay/graph.db       # SQLite code graph
  lanceDbPath: .coderelay/lance     # LanceDB vector store

  # Languages indexed by tree-sitter (all enabled by default):
  languages:
    - typescript
    - javascript
    - python
    - go
    - rust
    - java
    - cpp

  # Directories to skip:
  skipDirs:
    - node_modules
    - dist
    - build
    - .git
    - .lance
    - .coderelay

# ── Memory ───────────────────────────────────────────────────────────
memory:
  sessionDb: .coderelay/session.db
  longTermDb: .coderelay/longterm.db
  sessionAutoSummarizeEvery: 20   # turns before session auto-summarizes
  sessionKeepLastN: 5              # active turns kept in prompt

# ── MCP Server ───────────────────────────────────────────────────────
mcp:
  enabled: true
  transport: stdio     # only stdio is supported

# ── Governor ─────────────────────────────────────────────────────────
governor:
  # Writable paths (relative to rootDir). Sub-agents cannot write outside these.
  allowedPaths:
    - .

  # Additional deny patterns for shell commands (on top of hard-coded blocklist).
  extraDenyPatterns: []

  # Sandbox mode:
  #   worktree — git worktree branch per task (default, fast, no Docker needed)
  #   docker   — Docker container per task (stronger isolation, requires Docker)
  sandbox: worktree

  # Type checker run by verifier after each step:
  typeChecker: "npx tsc --noEmit"

  # Network egress allow-list (Docker mode only):
  allowedDomains:
    - api.anthropic.com
    - api.openai.com
    - generativelanguage.googleapis.com

# ── Sub-Agents ───────────────────────────────────────────────────────
agents:
  default: claude          # claude | gemini
  timeoutMs: 300000        # 5 minutes per step

  # System prompt prefix injected into every sub-agent invocation:
  systemPromptPrefix: |
    You are operating inside CodeRelay. Always prefer CodeRelay MCP tools
    (get_relevant_context, get_symbol, get_callers) over raw Read/Grep/Glob
    when answering questions about the codebase.
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `CODERELAY_CONFIG` | Override path to `coderelay.yaml` |
| `CODERELAY_DB` | Override path to `graph.db` |
| `CODERELAY_LOG_LEVEL` | `debug` / `info` / `warn` / `error` (default: `info`) |
| `CODERELAY_LOG_JSON` | Set to `1` for JSON log output (default: pretty) |

## Routing YAML Hot-Reload

The routing config (tag → provider mapping) hot-reloads on file change — no restart needed. All other config changes require a restart.
