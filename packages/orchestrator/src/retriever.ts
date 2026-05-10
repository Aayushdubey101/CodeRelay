import type { PlanStep } from './planner.js';

export interface ContextChunk {
  filePath: string;
  content: string;
  tokens: number;
  source: 'graph' | 'vector' | 'file';
}

export interface RetrievalManifest {
  step: number;
  chunks: ContextChunk[];
  totalTokens: number;
  budget: number;
}

export interface RetrieverOptions {
  tokenBudget?: number;
}

/** Minimal DB interface — satisfied by openGraphDb() return value */
export interface GraphDbLike {
  prepare<P, R>(sql: string): { all(...args: P[]): R[] };
}

/** Minimal vector store interface — satisfied by LanceVectorStore */
export interface VectorStoreLike {
  search(query: string, topK: number): Promise<Array<{ content: string; metadata?: Record<string, unknown> }>>;
}

function estimateTokens(text: string): number {
  // ~4 chars per token (GPT-style rough estimate)
  return Math.ceil(text.length / 4);
}

function dedup(chunks: ContextChunk[]): ContextChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = `${c.filePath}:${c.content.slice(0, 64)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class Retriever {
  private readonly _budget: number;

  constructor(
    private readonly _db: GraphDbLike,
    private readonly _vector: VectorStoreLike | null,
    opts: RetrieverOptions = {},
  ) {
    this._budget = opts.tokenBudget ?? 8000;
  }

  async retrieve(step: PlanStep): Promise<RetrievalManifest> {
    const candidates: ContextChunk[] = [];

    // 1. Graph: pull chunks for expected files
    if (step.expectedFiles.length > 0) {
      for (const filePath of step.expectedFiles) {
        interface Row { content: string }
        const rows = this._db
          .prepare<string, Row>(
            `SELECT c.content FROM chunks c
             JOIN files f ON c.file_id = f.id
             WHERE f.path LIKE ?
             LIMIT 10`,
          )
          .all(`%${filePath}%`);

        for (const r of rows) {
          candidates.push({
            filePath,
            content: r.content,
            tokens: estimateTokens(r.content),
            source: 'graph',
          });
        }
      }
    }

    // 2. Vector: semantic search on step intent
    if (this._vector !== null) {
      try {
        const hits = await this._vector.search(step.intent, 5);
        for (const h of hits) {
          const fp = typeof h.metadata?.['filePath'] === 'string' ? h.metadata['filePath'] : 'unknown';
          candidates.push({
            filePath: fp,
            content: h.content,
            tokens: estimateTokens(h.content),
            source: 'vector',
          });
        }
      } catch { /* vector store may not be initialized */ }
    }

    // 3. Deduplicate and fit to budget (greedy)
    const unique = dedup(candidates);
    const selected: ContextChunk[] = [];
    let total = 0;

    for (const c of unique) {
      if (total + c.tokens <= this._budget) {
        selected.push(c);
        total += c.tokens;
      }
    }

    return { step: step.step, chunks: selected, totalTokens: total, budget: this._budget };
  }
}
