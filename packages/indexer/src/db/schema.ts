export const GRAPH_DDL = `
  CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    path        TEXT    NOT NULL UNIQUE,
    hash        TEXT    NOT NULL,
    lang        TEXT    NOT NULL,
    mtime       INTEGER NOT NULL,
    indexed_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS symbols (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    parent_id      INTEGER          REFERENCES symbols(id) ON DELETE CASCADE,
    kind           TEXT    NOT NULL,
    name           TEXT    NOT NULL,
    qualified_name TEXT    NOT NULL,
    start          INTEGER NOT NULL,
    end            INTEGER NOT NULL,
    signature      TEXT,
    docstring      TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_symbols_file   ON symbols(file_id);
  CREATE INDEX IF NOT EXISTS idx_symbols_qname  ON symbols(qualified_name);

  CREATE TABLE IF NOT EXISTS edges (
    src        INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    dst        INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL,
    confidence REAL    NOT NULL DEFAULT 1.0,
    PRIMARY KEY (src, dst, kind)
  );

  CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src);
  CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst);

  CREATE TABLE IF NOT EXISTS chunks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_id     INTEGER          REFERENCES symbols(id) ON DELETE SET NULL,
    file_id       INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    content       TEXT    NOT NULL,
    token_count   INTEGER NOT NULL DEFAULT 0,
    embedding_ref TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_file   ON chunks(file_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_symbol ON chunks(symbol_id);
`;

export interface FileRow {
  id: number;
  path: string;
  hash: string;
  lang: string;
  mtime: number;
  indexed_at: number;
}

export interface SymbolRow {
  id: number;
  file_id: number;
  parent_id: number | null;
  kind: string;
  name: string;
  qualified_name: string;
  start: number;
  end: number;
  signature: string | null;
  docstring: string | null;
}

export interface EdgeRow {
  src: number;
  dst: number;
  kind: string;
  confidence: number;
}

export interface ChunkRow {
  id: number;
  symbol_id: number | null;
  file_id: number;
  content: string;
  token_count: number;
  embedding_ref: string | null;
}
