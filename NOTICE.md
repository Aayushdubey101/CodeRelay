# NOTICE

CodeRelay incorporates code and ideas from the following open-source projects.
Each upstream license file is preserved in `LICENSES/` and any copied/adapted
file in `packages/` carries an attribution header pointing back to its origin.

---

## Forked / Ported Sources

### zilliztech/claude-context
- **License:** MIT
- **Source:** <https://github.com/zilliztech/claude-context>
- **License file:** `LICENSES/claude-context-LICENSE.txt`
- **Used for:** MCP server scaffolding, AST chunker, Merkle-tree incremental
  indexer, embeddings provider abstraction
- **Modifications:** Replaced Milvus vector backend with LanceDB; added graph
  layer; replaced 4 tools with our 10
- **Pinned commit:** `367546904b5bcd1d7138a6ae5ca253c8cb0680a1`

### safishamsi/graphify
- **License:** MIT
- **Source:** <https://github.com/safishamsi/graphify>
- **License file:** `LICENSES/graphify-LICENSE.txt`
- **Used for:** Per-language tree-sitter symbol & call-graph extraction logic
- **Modifications:** Ported from Python to TypeScript; output goes to SQLite
  schema instead of NetworkX/JSON
- **Pinned commit:** `28b17d37f145701d7c6396375cabf7028ba449b3`

### awslabs/cli-agent-orchestrator (CAO)
- **License:** Apache 2.0
- **Source:** <https://github.com/awslabs/cli-agent-orchestrator>
- **License file:** `LICENSES/cao-LICENSE.txt`
- **Additional NOTICE:** `LICENSES/cao-NOTICE.txt` (required by Apache 2.0)
- **Used for:** Sub-agent provider abstraction patterns; session lifecycle design
- **Modifications:** Logic ported from Python to TypeScript; tmux replaced with
  execa subprocess management; adapted to our governor layer
- **Pinned commit:** `1f2a0487810ea6aaa44fe9c09ca81e7dd5621b52`

### mksglu/context-mode
- **License:** Elastic License 2.0 (ELv2) — **no code copied**
- **Source:** <https://github.com/mksglu/context-mode>
- **License file:** `LICENSES/context-mode-LICENSE.txt`
- **Used for:** Design study only — command security evaluator pattern,
  session DB schema, agent hook injection architecture
- **Modifications:** None — all equivalent functionality built from scratch
- **Pinned commit:** `f00a1abc83aeeb137ae137f3068fff74884d97c6`

---

## Algorithmic / Conceptual Credits

### Codebase-Memory (arxiv 2603.27277)
- **License:** Open source (per arxiv listing)
- **Used for:** 6-strategy call resolution algorithm
- **Form of use:** Re-implemented from paper description; no source code copied

---

## Runtime Dependencies

CodeRelay depends on standard npm packages (tree-sitter, better-sqlite3,
@modelcontextprotocol/sdk, lancedb, chokidar, execa, ink, zod, pino, etc.).
See each package's own license in `node_modules/<pkg>/LICENSE`.

---

## How to Update This File

When forking new code or porting new logic from an upstream repo:

1. Copy the upstream LICENSE file to `LICENSES/<project>-LICENSE.txt`.
2. Add a section above with: name, license, source URL, what was used, what
   you modified, and the pinned commit SHA.
3. In every file you copied or substantively adapted, add a top-of-file header:
   ```
   /* Adapted from <repo>@<sha>, MIT/Apache 2.0.
    * See LICENSES/<repo>-LICENSE.txt */
   ```
4. Commit `NOTICE.md`, the LICENSE file, and the adapted code together.
