import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const DDL = `
  CREATE TABLE IF NOT EXISTS manifests (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id   TEXT    NOT NULL,
    file      TEXT    NOT NULL,
    symbol    TEXT,
    chunk_id  TEXT,
    tokens    INTEGER NOT NULL DEFAULT 0,
    reason    TEXT    NOT NULL DEFAULT '',
    ts        INTEGER NOT NULL,
    UNIQUE(task_id, file, symbol, chunk_id)
  );

  CREATE INDEX IF NOT EXISTS idx_manifests_task ON manifests(task_id);
`;

export interface ManifestEntry {
  file: string;
  symbol?: string | undefined;
  chunk_id?: string | undefined;
  tokens: number;
  reason: string;
}

interface ManifestRow extends ManifestEntry {
  id: number;
  task_id: string;
  ts: number;
}

function openDb(dbPath?: string): Database.Database {
  const path = dbPath ?? join(process.cwd(), '.coderelay', 'manifest.db');
  if (path !== ':memory:') mkdirSync(join(path, '..'), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(DDL);
  return db;
}

export class ContextManifest {
  private readonly _db: Database.Database;

  constructor(dbPath?: string) {
    this._db = openDb(dbPath);
  }

  record(taskId: string, entry: ManifestEntry): void {
    const now = Date.now();
    this._db
      .prepare(
        `INSERT INTO manifests (task_id, file, symbol, chunk_id, tokens, reason, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(task_id, file, symbol, chunk_id) DO UPDATE SET
           tokens = excluded.tokens,
           reason = excluded.reason,
           ts     = excluded.ts`,
      )
      .run(
        taskId,
        entry.file,
        entry.symbol ?? null,
        entry.chunk_id ?? null,
        entry.tokens,
        entry.reason,
        now,
      );
  }

  getManifest(taskId: string): ManifestEntry[] {
    return (
      this._db
        .prepare<[string], ManifestRow>(
          `SELECT * FROM manifests WHERE task_id = ? ORDER BY id ASC`,
        )
        .all(taskId) as ManifestRow[]
    ).map(({ file, symbol, chunk_id, tokens, reason }) => ({
      file,
      symbol: symbol ?? undefined,
      chunk_id: chunk_id ?? undefined,
      tokens,
      reason,
    }));
  }

  hasManifest(taskId: string): boolean {
    const row = this._db
      .prepare<[string], { n: number }>(
        `SELECT COUNT(*) AS n FROM manifests WHERE task_id = ?`,
      )
      .get(taskId);
    return (row?.n ?? 0) > 0;
  }

  totalTokens(taskId: string): number {
    const row = this._db
      .prepare<[string], { t: number }>(
        `SELECT COALESCE(SUM(tokens), 0) AS t FROM manifests WHERE task_id = ?`,
      )
      .get(taskId);
    return row?.t ?? 0;
  }

  clear(taskId: string): void {
    this._db.prepare(`DELETE FROM manifests WHERE task_id = ?`).run(taskId);
  }

  close(): void {
    this._db.close();
  }
}
