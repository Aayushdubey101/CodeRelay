import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { openGraphDb } from './db/index.js';
import { SymbolExtractor } from './extract.js';
import { EdgeResolver } from './resolver.js';
import { TextCodeSplitter } from './upstream/splitter/text-splitter.js';
import { LanceVectorStore } from './upstream/vectordb/lancedb.js';
import type { Embedding } from './upstream/embedding/base-embedding.js';
import type { ExtractedSymbol, ExtractResult } from './extract.js';
import type { FileRow } from './db/schema.js';

export interface PipelineOptions {
  graphDbPath?: string | undefined;
  lanceDbPath?: string | undefined;
  embedding?: Embedding | undefined;
  chunkSize?: number | undefined;
  chunkOverlap?: number | undefined;
}

export interface IndexStats {
  filesIndexed: number;
  filesSkipped: number;
  symbolsInserted: number;
  edgesInserted: number;
  chunksInserted: number;
}

export class IndexPipeline {
  private readonly _db: Database.Database;
  private readonly _splitter: TextCodeSplitter;
  private readonly _embedding: Embedding | undefined;
  private readonly _lanceDbPath: string | undefined;
  private _extractor: SymbolExtractor | undefined;
  private _lance: LanceVectorStore | undefined;
  private _lanceReady = false;

  private constructor(
    db: Database.Database,
    splitter: TextCodeSplitter,
    embedding: Embedding | undefined,
    lanceDbPath: string | undefined,
  ) {
    this._db = db;
    this._splitter = splitter;
    this._embedding = embedding;
    this._lanceDbPath = lanceDbPath;
  }

  static async create(opts: PipelineOptions = {}): Promise<IndexPipeline> {
    const db = openGraphDb(opts.graphDbPath);
    const splitter = new TextCodeSplitter(opts.chunkSize, opts.chunkOverlap);
    return new IndexPipeline(db, splitter, opts.embedding, opts.lanceDbPath);
  }

  async indexFile(
    filePath: string,
    code: string,
    lang: string,
    mtime?: number,
  ): Promise<IndexStats> {
    const hash = createHash('sha256').update(code).digest('hex');
    const mt = mtime ?? Date.now();

    const existing = this._db
      .prepare<[string], FileRow>('SELECT * FROM files WHERE path = ?')
      .get(filePath);

    if (existing !== undefined && existing.hash === hash) {
      return { filesIndexed: 0, filesSkipped: 1, symbolsInserted: 0, edgesInserted: 0, chunksInserted: 0 };
    }

    if (this._extractor === undefined) {
      this._extractor = await SymbolExtractor.create();
    }

    try {
      await this._extractor.loadLanguage(lang);
    } catch {
      return { filesIndexed: 0, filesSkipped: 1, symbolsInserted: 0, edgesInserted: 0, chunksInserted: 0 };
    }

    const extracted: ExtractResult = this._extractor.extract(code, lang, filePath);
    const resolved = new EdgeResolver(extracted.symbols).resolve(extracted.edges);
    const chunks = await this._splitter.split(code, lang, filePath);

    const inner = this._db.transaction(
      (): Omit<IndexStats, 'filesSkipped'> => {
        const now = Date.now();

        this._db
          .prepare(
            `INSERT INTO files (path, hash, lang, mtime, indexed_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(path) DO UPDATE SET
               hash       = excluded.hash,
               lang       = excluded.lang,
               mtime      = excluded.mtime,
               indexed_at = excluded.indexed_at`,
          )
          .run(filePath, hash, lang, mt, now);

        const fileRow = this._db
          .prepare<[string], FileRow>('SELECT * FROM files WHERE path = ?')
          .get(filePath)!;
        const fileId = fileRow.id;

        // CASCADE on file_id deletes symbols → edges → chunks
        this._db.prepare('DELETE FROM symbols WHERE file_id = ?').run(fileId);

        const symIdMap = new Map<string, number>();
        const insertSym = this._db.prepare(
          `INSERT INTO symbols
             (file_id, parent_id, kind, name, qualified_name, start, end, signature, docstring)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        for (const sym of extracted.symbols) {
          const parentId =
            sym.parentQualifiedName !== undefined
              ? (symIdMap.get(sym.parentQualifiedName) ?? null)
              : null;
          const r = insertSym.run(
            fileId,
            parentId,
            sym.kind,
            sym.name,
            sym.qualifiedName,
            sym.startByte,
            sym.endByte,
            sym.signature ?? null,
            null,
          );
          symIdMap.set(sym.qualifiedName, Number(r.lastInsertRowid));
        }

        const insertEdge = this._db.prepare(
          `INSERT OR IGNORE INTO edges (src, dst, kind, confidence) VALUES (?, ?, ?, ?)`,
        );

        let edgesInserted = 0;
        for (const edge of resolved) {
          if (!edge.resolved) continue;
          const srcId =
            symIdMap.get(edge.srcQualifiedName) ?? this._lookupSymId(edge.srcQualifiedName);
          const dstId =
            symIdMap.get(edge.dstQualifiedName) ?? this._lookupSymId(edge.dstQualifiedName);
          if (srcId !== undefined && dstId !== undefined) {
            insertEdge.run(srcId, dstId, edge.kind, edge.confidence);
            edgesInserted++;
          }
        }

        const insertChunk = this._db.prepare(
          `INSERT INTO chunks (symbol_id, file_id, content, token_count, embedding_ref)
           VALUES (?, ?, ?, ?, NULL)`,
        );

        let chunksInserted = 0;
        for (const chunk of chunks) {
          const symId = this._findSymIdForLine(
            extracted.symbols,
            symIdMap,
            chunk.metadata.startLine,
          );
          const tokens = Math.ceil(chunk.content.length / 4);
          insertChunk.run(symId ?? null, fileId, chunk.content, tokens);
          chunksInserted++;
        }

        return { filesIndexed: 1, symbolsInserted: symIdMap.size, edgesInserted, chunksInserted };
      },
    );

    const stats = inner();

    if (this._embedding !== undefined && this._lanceDbPath !== undefined && chunks.length > 0) {
      await this._upsertEmbeddings(
        filePath,
        lang,
        chunks.map((c) => c.content),
      );
    }

    return { ...stats, filesSkipped: 0 };
  }

  async indexFiles(
    files: Array<{ path: string; code: string; lang: string; mtime?: number | undefined }>,
  ): Promise<IndexStats> {
    const total: IndexStats = {
      filesIndexed: 0,
      filesSkipped: 0,
      symbolsInserted: 0,
      edgesInserted: 0,
      chunksInserted: 0,
    };
    for (const f of files) {
      const s = await this.indexFile(f.path, f.code, f.lang, f.mtime);
      total.filesIndexed += s.filesIndexed;
      total.filesSkipped += s.filesSkipped;
      total.symbolsInserted += s.symbolsInserted;
      total.edgesInserted += s.edgesInserted;
      total.chunksInserted += s.chunksInserted;
    }
    return total;
  }

  getDb(): Database.Database {
    return this._db;
  }

  // --- private helpers ---

  private _lookupSymId(qualifiedName: string): number | undefined {
    const row = this._db
      .prepare<[string], { id: number }>('SELECT id FROM symbols WHERE qualified_name = ?')
      .get(qualifiedName);
    return row?.id;
  }

  private _findSymIdForLine(
    symbols: ExtractedSymbol[],
    symIdMap: Map<string, number>,
    line: number,
  ): number | undefined {
    let best: ExtractedSymbol | undefined;
    for (const sym of symbols) {
      if (sym.startLine <= line && line <= sym.endLine) {
        if (best === undefined || sym.startLine > best.startLine) best = sym;
      }
    }
    return best !== undefined ? symIdMap.get(best.qualifiedName) : undefined;
  }

  private async _upsertEmbeddings(
    filePath: string,
    lang: string,
    contents: string[],
  ): Promise<void> {
    if (this._lance === undefined) {
      this._lance = await LanceVectorStore.open(this._lanceDbPath!);
    }

    const col = 'chunks';
    if (!this._lanceReady) {
      const dim = this._embedding!.getDimension();
      await this._lance.createCollection(col, dim);
      this._lanceReady = true;
    }

    // Prefix-based delete: IDs are `${filePath}::${i}`
    const count = await this._lance.getCollectionRowCount(col);
    if (count > 0) {
      const escaped = filePath.replace(/'/g, "''");
      try {
        await this._lance.delete(col, []); // no-op path; use query below
        // Real delete by relativePath filter via query API
        const rows = (await this._lance.query(col, `relativePath = '${escaped}'`, ['id'], undefined)) as Array<{ id?: string }>;
        const ids = rows.map((r) => r.id).filter((id): id is string => typeof id === 'string');
        if (ids.length > 0) await this._lance.delete(col, ids);
      } catch {
        // ignore if table empty or filter fails
      }
    }

    const embedResults = await this._embedding!.embedBatch(contents);
    const docs = embedResults.map((ev, i) => ({
      id: `${filePath}::${i}`,
      vector: ev.vector,
      content: contents[i] ?? '',
      relativePath: filePath,
      startLine: 0,
      endLine: 0,
      fileExtension: lang,
      metadata: { chunkIndex: i },
    }));

    await this._lance.insert(col, docs);
  }
}
