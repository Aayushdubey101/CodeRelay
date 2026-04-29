# CodeRelay

> A CLI orchestrator that wraps Claude Code, Gemini CLI, Cursor, and other coding agents with a shared codebase graph, persistent memory, and safety governance — so they stop re-reading your repo, stop hallucinating, and stop deleting things they shouldn't.

**Status:** 🚧 In active development. See [`work.md`](./work.md) for the build plan.

## Strategy

CodeRelay is built by **integrating proven open-source projects** rather than reinventing every wheel. We fork and adapt:

- [`zilliztech/claude-context`](https://github.com/zilliztech/claude-context) (MIT) — MCP server, AST chunker, Merkle-tree incremental indexer, embeddings pipeline
- [`safishamsi/graphify`](https://github.com/safishamsi/graphify) (MIT) — tree-sitter symbol & call-graph extraction
- [`awslabs/cli-agent-orchestrator`](https://github.com/awslabs/cli-agent-orchestrator) (Apache 2.0) — sub-agent provider patterns
- [`mksglu/context-mode`](https://github.com/mksglu/context-mode) — MCP-layer governance pattern

Full attribution in [`NOTICE.md`](./NOTICE.md). Upstream LICENSE files in [`LICENSES/`](./LICENSES/).

Our own code focuses on the **differentiators**: tiered persistent memory, the Plan→Retrieve→Execute→Verify→Re-align loop, and a coherent governance layer.

## What it does

When you run a coding agent through CodeRelay:
- Your codebase is indexed into a queryable **graph** (symbols, calls, imports) — not just embedded.
- The agent gets a small set of **smart tools** (`get_symbol`, `get_callers`, etc.) instead of raw `grep`/`Read`.
- A **memory layer** persists decisions, conventions, and prior work across sessions.
- A **governance layer** sandboxes every action, blocks destructive commands, and rolls back any task.
- A **router** sends cheap calls (embeddings, summarization) to local Ollama and only uses Claude/Gemini for the final code-gen step.

Result: dramatically fewer tokens, fewer hallucinations, fewer rewrites.

## Repo layout

| Path                          | What's there                                            |
| ----------------------------- | ------------------------------------------------------- |
| [`work.md`](./work.md)        | Master build plan with checklist                        |
| [`prompt.md`](./prompt.md)    | Paste-into-Claude-Code session starter                  |
| [`NOTICE.md`](./NOTICE.md)    | Upstream attributions                                   |
| [`docs/architecture.md`](./docs/architecture.md) | Design invariants                    |
| [`docs/reuse-map.md`](./docs/reuse-map.md)       | What to copy from where (filled in Task 0.4) |
| [`docs/journal.md`](./docs/journal.md)           | Daily blocker log                    |
| `external/`                   | Git submodules of upstream projects (read-only refs)    |
| `packages/`                   | Our actual source code (monorepo workspaces)            |
| `LICENSES/`                   | Preserved upstream LICENSE files                        |

## Working on this project

1. Open this repo in Claude Code.
2. Paste the **Paste-Into-Claude-Code Block** from `prompt.md` as your first message.
3. Let Claude Code work on the **CURRENT TASK** only.
4. Tick boxes in `work.md` as acceptance tests pass.
5. Update `prompt.md` at end of session.

## License

MIT. See [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md).
