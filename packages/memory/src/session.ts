import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const DDL = `
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT    PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    summary    TEXT
  );

  CREATE TABLE IF NOT EXISTS session_turns (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    ts         INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_turns_session ON session_turns(session_id, id);
`;

export interface TurnRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  ts: number;
}

export interface SessionRow {
  id: string;
  created_at: number;
  updated_at: number;
  summary: string | null;
}

export type Summarizer = (turns: TurnRow[]) => Promise<string>;

export interface SessionMemoryOptions {
  dbPath?: string;
  summarize?: Summarizer;
  summarizeEvery?: number;
  keepAfterSummarize?: number;
}

function openDb(dbPath?: string): Database.Database {
  const path = dbPath ?? join(process.cwd(), '.coderelay', 'sessions.db');
  if (path !== ':memory:') mkdirSync(join(path, '..'), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(DDL);
  return db;
}

export class SessionMemory {
  private readonly _db: Database.Database;
  private readonly _summarize: Summarizer | undefined;
  private readonly _summarizeEvery: number;
  private readonly _keep: number;

  constructor(opts: SessionMemoryOptions = {}) {
    this._db = openDb(opts.dbPath);
    this._summarize = opts.summarize;
    this._summarizeEvery = opts.summarizeEvery ?? 20;
    this._keep = opts.keepAfterSummarize ?? 5;
  }

  openSession(id?: string): string {
    const sid = id ?? randomUUID();
    const now = Date.now();
    this._db
      .prepare(
        `INSERT INTO sessions (id, created_at, updated_at, summary)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(sid, now, now);
    return sid;
  }

  async addTurn(sessionId: string, role: string, content: string): Promise<void> {
    const now = Date.now();
    this._db
      .prepare(
        `INSERT INTO session_turns (session_id, role, content, ts) VALUES (?, ?, ?, ?)`,
      )
      .run(sessionId, role, content, now);
    this._db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sessionId);

    if (this._summarize !== undefined) {
      const count = (
        this._db
          .prepare<[string], { n: number }>(
            `SELECT COUNT(*) AS n FROM session_turns WHERE session_id = ?`,
          )
          .get(sessionId)!
      ).n;

      if (count % this._summarizeEvery === 0) {
        await this._doSummarize(sessionId);
      }
    }
  }

  getTurns(sessionId: string, limit?: number): TurnRow[] {
    if (limit !== undefined) {
      return this._db
        .prepare<[string, number], TurnRow>(
          `SELECT * FROM session_turns WHERE session_id = ? ORDER BY id ASC LIMIT ?`,
        )
        .all(sessionId, limit) as TurnRow[];
    }
    return this._db
      .prepare<[string], TurnRow>(
        `SELECT * FROM session_turns WHERE session_id = ? ORDER BY id ASC`,
      )
      .all(sessionId) as TurnRow[];
  }

  getSession(sessionId: string): SessionRow | undefined {
    return this._db
      .prepare<[string], SessionRow>(`SELECT * FROM sessions WHERE id = ?`)
      .get(sessionId) as SessionRow | undefined;
  }

  close(): void {
    this._db.close();
  }

  private async _doSummarize(sessionId: string): Promise<void> {
    const turns = this.getTurns(sessionId);
    const summary = await this._summarize!(turns);

    const keepIds = (
      this._db
        .prepare<[string, number], { id: number }>(
          `SELECT id FROM session_turns WHERE session_id = ? ORDER BY id DESC LIMIT ?`,
        )
        .all(sessionId, this._keep) as { id: number }[]
    ).map((r) => r.id);

    if (keepIds.length > 0) {
      const ph = keepIds.map(() => '?').join(',');
      this._db
        .prepare(
          `DELETE FROM session_turns WHERE session_id = ? AND id NOT IN (${ph})`,
        )
        .run(sessionId, ...keepIds);
    } else {
      this._db
        .prepare(`DELETE FROM session_turns WHERE session_id = ?`)
        .run(sessionId);
    }

    this._db
      .prepare(`UPDATE sessions SET summary = ?, updated_at = ? WHERE id = ?`)
      .run(summary, Date.now(), sessionId);
  }
}
