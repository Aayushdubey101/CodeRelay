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
- **Pinned commit:** *(fill in after submodule add)*

### safishamsi/graphify
- **License:** MIT
- **Source:** <https://github.com/safishamsi/graphify>
- **License file:** `LICENSES/graphify-LICENSE.txt`
- **Used for:** Per-language tree-sitter symbol & call-graph extraction logic
- **Modifications:** Ported from Python to TypeScript; output goes to SQLite
  schema instead of NetworkX/JSON
- **Pinned commit:** *(fill in after submodule add)*

### awslabs/cli-agent-orchestrator (CAO)
- **License:** Apache 2.0
- **Source:** <https://github.com/awslabs/cli-agent-orchestrator>
- **License file:** `LICENSES/cao-LICENSE.txt`
- **Used for:** Reference for sub-agent provider abstraction patterns
- **Modifications:** Reimplemented in TypeScript; adapted to our governor layer
- **Pinned commit:** *(fill in after submodule add)*

### mksglu/context-mode
- **License:** *(verify on first clone)*
- **Source:** <https://github.com/mksglu/context-mode>
- **License file:** `LICENSES/context-mode-LICENSE.txt`
- **Used for:** Pattern reference only — MCP-layer hook redirection design
- **Modifications:** Concept only; no code copied
- **Pinned commit:** *(fill in after submodule add)*

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
