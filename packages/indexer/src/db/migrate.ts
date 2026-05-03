import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { GRAPH_DDL } from './schema.js';

export function openGraphDb(dbPath?: string): Database.Database {
  const path = dbPath ?? join(process.cwd(), '.coderelay', 'graph.db');
  if (path !== ':memory:') {
    mkdirSync(join(path, '..'), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(GRAPH_DDL);
  return db;
}
