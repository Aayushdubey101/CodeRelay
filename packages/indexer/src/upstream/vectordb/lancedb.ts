/* LanceDB adapter — replaces Milvus stub from task 2.5.
   Implements VectorDatabase using embedded @lancedb/lancedb. */

import * as lance from '@lancedb/lancedb';
import { Field, FixedSizeList, Float32, Int32, Schema, Utf8 } from 'apache-arrow';
import type { VectorDatabase, VectorDocument, SearchOptions, VectorSearchResult } from './types.js';

// Row stored in LanceDB — metadata is JSON-stringified
interface LanceRow {
  id: string;
  vector: number[];
  content: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  fileExtension: string;
  metadata: string;
}

function toRow(doc: VectorDocument): LanceRow {
  return {
    id: doc.id,
    vector: doc.vector,
    content: doc.content,
    relativePath: doc.relativePath,
    startLine: doc.startLine,
    endLine: doc.endLine,
    fileExtension: doc.fileExtension,
    metadata: JSON.stringify(doc.metadata),
  };
}

function fromRow(row: Record<string, unknown>, score: number): VectorSearchResult {
  return {
    document: {
      id: String(row['id'] ?? ''),
      vector: Array.isArray(row['vector']) ? (row['vector'] as number[]) : [],
      content: String(row['content'] ?? ''),
      relativePath: String(row['relativePath'] ?? ''),
      startLine: typeof row['startLine'] === 'number' ? row['startLine'] : 0,
      endLine: typeof row['endLine'] === 'number' ? row['endLine'] : 0,
      fileExtension: String(row['fileExtension'] ?? ''),
      metadata: (() => {
        try {
          return JSON.parse(String(row['metadata'] ?? '{}')) as Record<string, unknown>;
        } catch {
          return {};
        }
      })(),
    },
    score,
  };
}

function makeSchema(dim: number): Schema {
  return new Schema([
    new Field('id', new Utf8(), false),
    new Field('vector', new FixedSizeList(dim, new Field('item', new Float32(), true)), false),
    new Field('content', new Utf8(), false),
    new Field('relativePath', new Utf8(), false),
    new Field('startLine', new Int32(), false),
    new Field('endLine', new Int32(), false),
    new Field('fileExtension', new Utf8(), false),
    new Field('metadata', new Utf8(), false),
  ]);
}

export class LanceVectorStore implements VectorDatabase {
  private readonly _conn: lance.Connection;
  private readonly _tables = new Map<string, lance.Table>();

  private constructor(conn: lance.Connection) {
    this._conn = conn;
  }

  static async open(dbPath: string): Promise<LanceVectorStore> {
    const conn = await lance.connect(dbPath);
    return new LanceVectorStore(conn);
  }

  async createCollection(collectionName: string, dimension: number, _description?: string): Promise<void> {
    if (this._tables.has(collectionName)) return;
    const existing = await this._conn.tableNames();
    if (existing.includes(collectionName)) {
      this._tables.set(collectionName, await this._conn.openTable(collectionName));
    } else {
      const schema = makeSchema(dimension);
      const tbl = await this._conn.createEmptyTable(collectionName, schema, { existOk: true });
      this._tables.set(collectionName, tbl);
    }
  }

  async dropCollection(collectionName: string): Promise<void> {
    await this._conn.dropTable(collectionName);
    this._tables.delete(collectionName);
  }

  async hasCollection(collectionName: string): Promise<boolean> {
    const names = await this._conn.tableNames();
    return names.includes(collectionName);
  }

  async listCollections(): Promise<string[]> {
    return this._conn.tableNames();
  }

  async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    const tbl = await this._getTable(collectionName);
    await tbl.add(documents.map(toRow) as unknown as Record<string, unknown>[]);
  }

  async search(
    collectionName: string,
    queryVector: number[],
    options?: SearchOptions,
  ): Promise<VectorSearchResult[]> {
    const tbl = await this._getTable(collectionName);
    const k = options?.topK ?? 10;

    let q = tbl.vectorSearch(queryVector).limit(k);
    if (options?.filterExpr !== undefined) {
      q = q.where(options.filterExpr);
    }

    const rows = (await q.toArray()) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const score = typeof row['_distance'] === 'number' ? (row['_distance'] as number) : 0;
      return fromRow(row, score);
    });
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const tbl = await this._getTable(collectionName);
    const list = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
    await tbl.delete(`id IN (${list})`);
  }

  async query(
    collectionName: string,
    filter: string,
    outputFields: string[],
    limit?: number,
  ): Promise<Record<string, unknown>[]> {
    const tbl = await this._getTable(collectionName);
    let q = tbl.query().where(filter);
    if (outputFields.length > 0) q = q.select(outputFields);
    if (limit !== undefined) q = q.limit(limit);
    return (await q.toArray()) as Record<string, unknown>[];
  }

  async getCollectionRowCount(collectionName: string): Promise<number> {
    const tbl = await this._getTable(collectionName);
    return tbl.countRows();
  }

  private async _getTable(collectionName: string): Promise<lance.Table> {
    const cached = this._tables.get(collectionName);
    if (cached !== undefined) return cached;
    const tbl = await this._conn.openTable(collectionName);
    this._tables.set(collectionName, tbl);
    return tbl;
  }
}
