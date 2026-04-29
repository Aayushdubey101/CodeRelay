# Reuse Map

> **Status:** Stub — to be filled in during Task 0.4 (Reuse Audit).
> After `external/` submodules are cloned (Task 0.3), the agent reads each
> upstream repo and fills in this file with the **exact files/folders** to
> copy or port and what to skip.

This file is the source of truth for **what we take from where**. Update it
whenever a new upstream is added or a new file is ported.

---

## Format

For each upstream repo, list:

```
### <repo-name>
- Pinned commit: <sha>
- License: <MIT|Apache-2.0>

#### COPY (vendor as-is into packages/<our-package>/src/upstream/)
- path/to/file.ts → packages/indexer/src/upstream/file.ts   [reason]

#### PORT (translate / adapt into packages/<our-package>/src/)
- path/to/file.py → packages/indexer/src/extract.ts         [reason]

#### STUDY (read for ideas, do not copy)
- path/to/file.md   [what concept it teaches us]

#### SKIP (do not use)
- path/to/file.ts   [why irrelevant]
```

---

## zilliztech/claude-context

*(to be filled in Task 0.4)*

#### COPY
- *(TBD)*

#### PORT
- *(TBD)*

#### STUDY
- `README.md` — overall architecture
- `packages/core/src/sync/` — Merkle-tree approach

#### SKIP
- `packages/vscode-extension/` — we are CLI-only

---

## safishamsi/graphify

*(to be filled in Task 0.4)*

#### COPY
- *(none — different language)*

#### PORT
- `graphify/extract.py` → `packages/indexer/src/extract.ts`
- `graphify/cluster.py` → *(maybe v2 — Leiden community detection)*

#### STUDY
- `ARCHITECTURE.md` — pipeline structure
- `graphify/security.py` — path containment patterns

#### SKIP
- Whisper / video transcription pipeline — not relevant for code-only
- vis.js viewer — not for v1

---

## awslabs/cli-agent-orchestrator

*(to be filled in Task 0.4)*

#### COPY
- *(none — Python)*

#### PORT
- `cli_agent_orchestrator/providers/claude_code.py` → `packages/sub-agents/src/claude.ts`
- `cli_agent_orchestrator/providers/gemini_cli.py` → `packages/sub-agents/src/gemini.ts`

#### STUDY
- `docs/agent-profile.md` — agent profile pattern
- Tool-restriction enforcement per provider

#### SKIP
- `tmux-install.sh` — we don't use tmux orchestration

---

## mksglu/context-mode

*(to be filled in Task 0.4)*

#### COPY
- *(none planned — pattern only)*

#### PORT
- *(none planned — pattern only)*

#### STUDY
- Hook-based redirection logic
- Sandbox-then-redirect approach

#### SKIP
- *(everything else)*
