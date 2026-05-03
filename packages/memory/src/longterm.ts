import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const DDL = `
  CREATE TABLE IF NOT EXISTS facts (
    id         TEXT    PRIMARY KEY,
    text       TEXT    NOT NULL,
    embedding  BLOB,
    ts         INTEGER NOT NULL,
    tags       TEXT    NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_facts_ts ON facts(ts DESC);
`;

export interface FactRow {
  id: string;
  text: string;
  embedding: Buffer | null;
  ts: number;
  tags: string;
}

export interface Embedding {
  embed(texts: string[]): Promise<number[][]>;
  getDimension(): number;
}

export interface LongTermMemoryOptions {
  dbPath?: string;
  embedding?: Embedding;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function openDb(dbPath?: string): Database.Database {
  const path = dbPath ?? join(process.cwd(), '.coderelay', 'longterm.db');
  if (path !== ':memory:') mkdirSync(join(path, '..'), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(DDL);
  return db;
}

export class LongTermMemory {
  private readonly _db: Database.Database;
  private readonly _embedding: Embedding | undefined;

  constructor(opts: LongTermMemoryOptions = {}) {
    this._db = openDb(opts.dbPath);
    this._embedding = opts.embedding;
  }

  async recordFact(text: string, tags: string[] = []): Promise<string> {
    const id = randomUUID();
    const ts = Date.now();
    let embBuf: Buffer | null = null;

    if (this._embedding !== undefined) {
      const vecs = await this._embedding.embed([text]);
      const vec = vecs[0]!;
      embBuf = Buffer.from(new Float32Array(vec).buffer);
    }

    this._db
      .prepare(
        `INSERT INTO facts (id, text, embedding, ts, tags) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, text, embBuf, ts, tags.join(','));

    return id;
  }

  async searchText(query: string, limit = 5): Promise<FactRow[]> {
    if (this._embedding !== undefined) {
      return this._vectorSearch(query, limit);
    }
    return this._likeSearch(query, limit);
  }

  deleteFact(id: string): void {
    this._db.prepare(`DELETE FROM facts WHERE id = ?`).run(id);
  }

  getAllFacts(): FactRow[] {
    return this._db
      .prepare<[], FactRow>(`SELECT * FROM facts ORDER BY ts DESC`)
      .all() as FactRow[];
  }

  close(): void {
    this._db.close();
  }

  private _likeSearch(query: string, limit: number): FactRow[] {
    return this._db
      .prepare<[string, number], FactRow>(
        `SELECT * FROM facts WHERE text LIKE ? ORDER BY ts DESC LIMIT ?`,
      )
      .all(`%${query}%`, limit) as FactRow[];
  }

  private async _vectorSearch(query: string, limit: number): Promise<FactRow[]> {
    const qvecs = await this._embedding!.embed([query]);
    const qvec = qvecs[0]!;

    const rows = this._db
      .prepare<[], FactRow>(`SELECT * FROM facts WHERE embedding IS NOT NULL`)
      .all() as FactRow[];

    const scored = rows.map((r) => {
      const arr = new Float32Array(r.embedding!.buffer, r.embedding!.byteOffset, r.embedding!.byteLength / 4);
      const score = cosineSim(qvec, Array.from(arr));
      return { row: r, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.row);
  }
}
