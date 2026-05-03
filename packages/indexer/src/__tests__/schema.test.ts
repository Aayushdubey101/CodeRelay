import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openGraphDb } from '../db/migrate.js';
import type { FileRow, SymbolRow, EdgeRow, ChunkRow } from '../db/schema.js';

let db: Database.Database;

afterEach(() => {
  db?.close();
});

describe('openGraphDb', () => {
  it('creates all four tables in an in-memory DB', () => {
    db = openGraphDb(':memory:');
    const tables = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]
    ).map((r) => r.name);

    expect(tables).toContain('files');
    expect(tables).toContain('symbols');
    expect(tables).toContain('edges');
    expect(tables).toContain('chunks');
  });

  it('is idempotent — running twice does not error', () => {
    db = openGraphDb(':memory:');
    expect(() => openGraphDb(':memory:')).not.toThrow();
  });
});

describe('files table', () => {
  it('insert and query a file row', () => {
    db = openGraphDb(':memory:');
    const now = Date.now();

    db.prepare(
      `INSERT INTO files (path, hash, lang, mtime, indexed_at) VALUES (?, ?, ?, ?, ?)`,
    ).run('src/foo.ts', 'abc123', 'typescript', now, now);

    const row = db.prepare(`SELECT * FROM files WHERE path = ?`).get('src/foo.ts') as FileRow;

    expect(row.path).toBe('src/foo.ts');
    expect(row.hash).toBe('abc123');
    expect(row.lang).toBe('typescript');
    expect(row.mtime).toBe(now);
    expect(row.id).toBeGreaterThan(0);
  });

  it('enforces UNIQUE on path', () => {
    db = openGraphDb(':memory:');
    const now = Date.now();
    db.prepare(`INSERT INTO files (path, hash, lang, mtime, indexed_at) VALUES (?, ?, ?, ?, ?)`).run(
      'dup.ts', 'h1', 'typescript', now, now,
    );
    expect(() =>
      db.prepare(`INSERT INTO files (path, hash, lang, mtime, indexed_at) VALUES (?, ?, ?, ?, ?)`).run(
        'dup.ts', 'h2', 'typescript', now, now,
      ),
    ).toThrow();
  });
});

describe('symbols table', () => {
  it('insert and query a symbol row', () => {
    db = openGraphDb(':memory:');
    const now = Date.now();
    const fileId = (
      db.prepare(`INSERT INTO files (path, hash, lang, mtime, indexed_at) VALUES (?, ?, ?, ?, ?)`).run(
        'src/bar.ts', 'def456', 'typescript', now, now,
      )
    ).lastInsertRowid as number;

    db.prepare(
      `INSERT INTO symbols (file_id, parent_id, kind, name, qualified_name, start, end, signature, docstring)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(fileId, 'function', 'greet', 'bar.greet', 0, 120, '(name: string): string', 'Says hello.');

    const sym = db.prepare(`SELECT * FROM symbols WHERE qualified_name = ?`).get('bar.greet') as SymbolRow;

    expect(sym.name).toBe('greet');
    expect(sym.kind).toBe('function');
    expect(sym.file_id).toBe(fileId);
    expect(sym.parent_id).toBeNull();
    expect(sym.signature).toBe('(name: string): string');
    expect(sym.docstring).toBe('Says hello.');
    expect(sym.start).toBe(0);
    expect(sym.end).toBe(120);
  });
});

describe('edges table', () => {
  it('insert and query an edge', () => {
    db = openGraphDb(':memory:');
    const now = Date.now();
    const fid = (
      db.prepare(`INSERT INTO files (path, hash, lang, mtime, indexed_at) VALUES (?, ?, ?, ?, ?)`).run(
        'e.ts', 'h', 'typescript', now, now,
      )
    ).lastInsertRowid as number;

    const sid1 = (
      db.prepare(`INSERT INTO symbols (file_id, parent_id, kind, name, qualified_name, start, end) VALUES (?,NULL,?,?,?,?,?)`).run(
        fid, 'function', 'caller', 'e.caller', 0, 50,
      )
    ).lastInsertRowid as number;

    const sid2 = (
      db.prepare(`INSERT INTO symbols (file_id, parent_id, kind, name, qualified_name, start, end) VALUES (?,NULL,?,?,?,?,?)`).run(
        fid, 'function', 'callee', 'e.callee', 60, 100,
      )
    ).lastInsertRowid as number;

    db.prepare(`INSERT INTO edges (src, dst, kind, confidence) VALUES (?, ?, ?, ?)`).run(sid1, sid2, 'calls', 0.9);

    const edge = db.prepare(`SELECT * FROM edges WHERE src = ? AND dst = ?`).get(sid1, sid2) as EdgeRow;

    expect(edge.kind).toBe('calls');
    expect(edge.confidence).toBeCloseTo(0.9);
  });

  it('enforces PRIMARY KEY (src, dst, kind)', () => {
    db = openGraphDb(':memory:');
    const now = Date.now();
    const fid = (db.prepare(`INSERT INTO files (path,hash,lang,mtime,indexed_at) VALUES(?,?,?,?,?)`).run('f.ts','h','ts',now,now)).lastInsertRowid as number;
    const s1 = (db.prepare(`INSERT INTO symbols(file_id,parent_id,kind,name,qualified_name,start,end) VALUES(?,NULL,?,?,?,?,?)`).run(fid,'fn','a','f.a',0,10)).lastInsertRowid as number;
    const s2 = (db.prepare(`INSERT INTO symbols(file_id,parent_id,kind,name,qualified_name,start,end) VALUES(?,NULL,?,?,?,?,?)`).run(fid,'fn','b','f.b',11,20)).lastInsertRowid as number;
    db.prepare(`INSERT INTO edges(src,dst,kind,confidence) VALUES(?,?,?,?)`).run(s1,s2,'calls',1.0);
    expect(() => db.prepare(`INSERT INTO edges(src,dst,kind,confidence) VALUES(?,?,?,?)`).run(s1,s2,'calls',1.0)).toThrow();
  });
});

describe('chunks table', () => {
  it('insert and query a chunk', () => {
    db = openGraphDb(':memory:');
    const now = Date.now();
    const fid = (db.prepare(`INSERT INTO files(path,hash,lang,mtime,indexed_at) VALUES(?,?,?,?,?)`).run('c.ts','h','ts',now,now)).lastInsertRowid as number;

    db.prepare(
      `INSERT INTO chunks (symbol_id, file_id, content, token_count, embedding_ref) VALUES (NULL, ?, ?, ?, ?)`,
    ).run(fid, 'export function foo() {}', 8, null);

    const chunk = db.prepare(`SELECT * FROM chunks WHERE file_id = ?`).get(fid) as ChunkRow;

    expect(chunk.content).toBe('export function foo() {}');
    expect(chunk.token_count).toBe(8);
    expect(chunk.symbol_id).toBeNull();
    expect(chunk.embedding_ref).toBeNull();
  });
});

describe('CASCADE delete', () => {
  it('deleting a file cascades to symbols and chunks', () => {
    db = openGraphDb(':memory:');
    const now = Date.now();
    const fid = (db.prepare(`INSERT INTO files(path,hash,lang,mtime,indexed_at) VALUES(?,?,?,?,?)`).run('del.ts','h','ts',now,now)).lastInsertRowid as number;
    db.prepare(`INSERT INTO symbols(file_id,parent_id,kind,name,qualified_name,start,end) VALUES(?,NULL,?,?,?,?,?)`).run(fid,'fn','x','del.x',0,10);
    db.prepare(`INSERT INTO chunks(symbol_id,file_id,content,token_count) VALUES(NULL,?,?,?)`).run(fid,'code',3);

    db.prepare(`DELETE FROM files WHERE id = ?`).run(fid);

    const syms = db.prepare(`SELECT * FROM symbols WHERE file_id = ?`).all(fid);
    const cks = db.prepare(`SELECT * FROM chunks WHERE file_id = ?`).all(fid);
    expect(syms.length).toBe(0);
    expect(cks.length).toBe(0);
  });
});
