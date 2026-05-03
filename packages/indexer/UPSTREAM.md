# Indexer — Upstream Vendoring Notes

Upstream: `zilliztech/claude-context@ead19f4` (MIT)
Vendored into: `src/upstream/`

## What Was Taken

| Upstream path | Destination | Changes |
|---|---|---|
| `packages/core/src/splitter/index.ts` | `src/upstream/splitter/index.ts` | Interface preserved; `SplitterType` updated; exports point to `text-splitter` instead of `ast-splitter` + `langchain-splitter` |
| `packages/core/src/splitter/ast-splitter.ts` | **NOT vendored** | Uses native `tree-sitter` (requires native compilation). Replaced by `text-splitter.ts` — see below |
| `packages/core/src/splitter/langchain-splitter.ts` | **NOT vendored** | Requires `langchain` (heavy dep). Logic subsumed by `text-splitter.ts` |
| `packages/core/src/sync/merkle.ts` | `src/upstream/sync/merkle.ts` | Minor: `any` → typed, `filter(Boolean)` → typed predicate |
| `packages/core/src/sync/synchronizer.ts` | `src/upstream/sync/synchronizer.ts` | Snapshot path changed from `~/.context/` to `~/.coderelay/`; indexed `for` loops → `for..of`; `string | undefined` concatenation fixed; error handling typed |
| `packages/core/src/embedding/base-embedding.ts` | `src/upstream/embedding/base-embedding.ts` | No changes |
| `packages/core/src/embedding/openai-embedding.ts` | `src/upstream/embedding/openai-embedding.ts` | `noUncheckedIndexedAccess` fixes (local variable for record lookup) |
| `packages/core/src/embedding/ollama-embedding.ts` | `src/upstream/embedding/ollama-embedding.ts` | `any` → typed; `Record<string, any>` → `Record<string, unknown>` |
| `packages/core/src/embedding/gemini-embedding.ts` | **NOT vendored** | Uses `@google/genai` (different from `@google/generative-ai` in router). Defer to task 2.5 |
| `packages/core/src/embedding/voyageai-embedding.ts` | **NOT vendored** | `voyageai` package not in workspace. Defer to task 2.5 |
| `packages/core/src/vectordb/types.ts` | `src/upstream/vectordb/types.ts` | Milvus error constant removed; hybrid search types removed (not needed for LanceDB adapter); `Record<string, any>` → `Record<string, unknown>` |
| `packages/core/src/vectordb/milvus-vectordb.ts` | **NOT vendored** | Milvus-specific, replaced by `lancedb-stub.ts` |
| `packages/core/src/vectordb/milvus-restful-vectordb.ts` | **NOT vendored** | Milvus-specific |
| `packages/core/src/vectordb/zilliz-utils.ts` | **NOT vendored** | Zilliz Cloud management API, not needed |

## New Files

| File | Purpose |
|---|---|
| `src/upstream/splitter/text-splitter.ts` | Regex-based splitter implementing the same `Splitter` interface as upstream's `AstCodeSplitter`. Uses top-level declaration patterns per language. **Replace with web-tree-sitter in task 2.3.** |
| `src/upstream/vectordb/lancedb-stub.ts` | Implements `VectorDatabase` interface with all methods throwing "not implemented". **Replace with real LanceDB adapter in task 2.5.** |

## Deferred

- `gemini-embedding.ts` — needs `@google/genai` package (not `@google/generative-ai`)
- `voyageai-embedding.ts` — needs `voyageai` package
- Full AST splitting — needs `web-tree-sitter` WASM (task 2.3)
- LanceDB vector store — (task 2.5)
