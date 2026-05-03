import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const DDL = `
  CREATE TABLE IF NOT EXISTS cold_context (
    id       TEXT PRIMARY KEY,
    content  TEXT NOT NULL,
    tokens   INTEGER NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    evicted_at INTEGER NOT NULL
  );
`;

export interface ContextItem {
  id: string;
  content: string;
  tokens: number;
  metadata?: Record<string, unknown>;
}

interface ColdRow {
  id: string;
  content: string;
  tokens: number;
  metadata: string;
  evicted_at: number;
}

export interface ContextPagerOptions {
  maxTokens: number;
  dbPath?: string;
}

function openDb(dbPath?: string): Database.Database {
  const path = dbPath ?? join(process.cwd(), '.coderelay', 'pager.db');
  if (path !== ':memory:') mkdirSync(join(path, '..'), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(DDL);
  return db;
}

export class ContextPager {
  private readonly _db: Database.Database;
  private readonly _maxTokens: number;
  private _hot: ContextItem[] = [];
  private _hotTokens = 0;

  constructor(opts: ContextPagerOptions) {
    this._maxTokens = opts.maxTokens;
    this._db = openDb(opts.dbPath);
  }

  add(item: ContextItem): void {
    // If item alone exceeds budget, send straight to cold
    if (item.tokens > this._maxTokens) {
      this._sendToCold(item);
      return;
    }

    // Evict LRU items until there's room
    while (this._hotTokens + item.tokens > this._maxTokens && this._hot.length > 0) {
      const evicted = this._hot.shift()!;
      this._hotTokens -= evicted.tokens;
      this._sendToCold(evicted);
    }

    this._hot.push(item);
    this._hotTokens += item.tokens;
  }

  retrieve(id: string): ContextItem | undefined {
    const row = this._db
      .prepare<[string], ColdRow>(`SELECT * FROM cold_context WHERE id = ?`)
      .get(id) as ColdRow | undefined;

    if (row === undefined) return undefined;

    this._db.prepare(`DELETE FROM cold_context WHERE id = ?`).run(id);

    const item: ContextItem = {
      id: row.id,
      content: row.content,
      tokens: row.tokens,
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    };

    this.add(item);
    return item;
  }

  getHot(): ContextItem[] {
    return [...this._hot];
  }

  hotTokens(): number {
    return this._hotTokens;
  }

  coldCount(): number {
    const row = this._db
      .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM cold_context`)
      .get();
    return row?.n ?? 0;
  }

  coldIds(): string[] {
    return (
      this._db
        .prepare<[], { id: string }>(`SELECT id FROM cold_context ORDER BY evicted_at DESC`)
        .all() as { id: string }[]
    ).map((r) => r.id);
  }

  clear(): void {
    this._hot = [];
    this._hotTokens = 0;
    this._db.prepare(`DELETE FROM cold_context`).run();
  }

  close(): void {
    this._db.close();
  }

  private _sendToCold(item: ContextItem): void {
    this._db
      .prepare(
        `INSERT INTO cold_context (id, content, tokens, metadata, evicted_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content    = excluded.content,
           tokens     = excluded.tokens,
           metadata   = excluded.metadata,
           evicted_at = excluded.evicted_at`,
      )
      .run(
        item.id,
        item.content,
        item.tokens,
        JSON.stringify(item.metadata ?? {}),
        Date.now(),
      );
  }
}
