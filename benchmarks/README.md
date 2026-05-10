# CodeRelay Benchmarks

## Running

```bash
pnpm bench                        # run against current directory
pnpm bench -- --repo /path/to/repo --runs 3
```

Results written to `benchmarks/results.json`.

## Targets (v0.1.0)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Index throughput | < 2 min on 100k LoC | `coderelay index` timing |
| Retriever latency | < 500 ms p95 | `coderelay context` timing |
| Token reduction vs raw | ≥ 60% | compare usage.db with baseline |
| Task success parity | ≥ 90% of raw | same tasks, compare outcomes |

## Methodology

### Token Reduction (9.2)

Run the same task twice:
1. **Baseline**: raw `claude` CLI with no CodeRelay — measure tokens from Anthropic API response headers
2. **CodeRelay**: `coderelay run-tui "<same task>"` — measure from `.coderelay/usage.db`

Reduction = `(baseline_tokens - coderelay_tokens) / baseline_tokens`

Why CodeRelay wins:
- Sub-agent calls `get_relevant_context(query, 8000)` instead of `Read` on 20 files
- Context manifest deduplication prevents re-loading the same chunks per step
- Embeddings + cheap summarization done by Ollama — free tokens not counted

### Indexer Throughput (9.3)

```bash
time coderelay index /path/to/100k-loc-repo
```

Target: `< 2 min` (< 120s wall clock). Bottleneck is tree-sitter WASM parsing. Web-tree-sitter runs synchronously per file; batch size 50.

### Retriever Latency (9.3)

```bash
# Run 100 context queries, measure p95
for i in $(seq 100); do time coderelay context "add error handling" 2>&1; done
```

Target: `< 500 ms p95`. Retriever is: SQLite LIKE query + optional vector search + dedup. No LLM call.

## Sample Results

*(To be filled after running `pnpm bench` on a real 100k+ LoC repo)*

```
CodeRelay Benchmark — <date>
Repo: <path>  Runs: 3
───────────────────────────────────────────────────────────────────
Task                  Status       ms      TokIn     TokOut
───────────────────────────────────────────────────────────────────
index-speed           OK         8420          0          0
graph-stats           OK           12          0          0
search-latency        OK           45          0          0
context-retrieval     OK           89          0          0
plan-generation       OK            3          0          0
───────────────────────────────────────────────────────────────────
Success rate    : 100.0%
Avg duration    : 1714 ms
```

## Updating Results

After each significant code change:
1. Run `pnpm bench -- --repo <your-test-repo> --runs 3`
2. Copy summary numbers into the table above
3. Commit `benchmarks/results.json` + `benchmarks/README.md`
