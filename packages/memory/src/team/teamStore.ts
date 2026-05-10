import Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { encrypt, decrypt, deriveKey } from './crypto.js';

const DDL = `
  CREATE TABLE IF NOT EXISTS shared_facts (
    id          TEXT PRIMARY KEY,
    content_enc TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    author      TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sf_ts ON shared_facts(created_at DESC);
`;

export interface SharedFact {
  id: string;
  content: string;
  author: string;
  createdAt: number;
}

export class TeamStore {
  private db: Database.Database;
  private key: Buffer;
  private queue: Promise<void> = Promise.resolve();

  constructor(dbPath: string, passphrase: string, private readonly author: string) {
    mkdirSync(join(dbPath, '..'), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(DDL);
    this.key = deriveKey(passphrase);
  }

  write(content: string): Promise<void> {
    this.queue = this.queue.then(() => {
      const id = randomUUID();
      const contentHash = createHash('sha256').update(content).digest('hex');
      const existing = this.db.prepare<[string], { id: string }>(
        'SELECT id FROM shared_facts WHERE content_hash = ?'
      ).get(contentHash);
      if (existing) return;

      const contentEnc = encrypt(content, this.key);
      this.db.prepare(
        'INSERT INTO shared_facts (id, content_enc, content_hash, author, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, contentEnc, contentHash, this.author, Date.now());
    });
    return this.queue;
  }

  readAll(since = 0): SharedFact[] {
    const rows = this.db.prepare<[number], { id: string; content_enc: string; author: string; created_at: number }>(
      'SELECT id, content_enc, author, created_at FROM shared_facts WHERE created_at > ? ORDER BY created_at ASC, rowid ASC'
    ).all(since);

    return rows.map(row => ({
      id: row.id,
      content: decrypt(row.content_enc, this.key),
      author: row.author,
      createdAt: row.created_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}
