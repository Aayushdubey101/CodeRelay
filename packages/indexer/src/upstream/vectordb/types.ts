/* Adapted from zilliztech/claude-context@ead19f4, MIT. See LICENSES/claude-context-LICENSE.txt */
/* NOTE: Milvus/Zilliz-specific content stripped. VectorDatabase interface kept
   as the contract for the LanceDB adapter in task 2.5. */

export interface VectorDocument {
  id: string;
  vector: number[];
  content: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  fileExtension: string;
  metadata: Record<string, unknown>;
}

export interface SearchOptions {
  topK?: number | undefined;
  filter?: Record<string, unknown> | undefined;
  threshold?: number | undefined;
  filterExpr?: string | undefined;
}

export interface VectorSearchResult {
  document: VectorDocument;
  score: number;
}

export interface VectorDatabase {
  createCollection(collectionName: string, dimension: number, description?: string): Promise<void>;
  dropCollection(collectionName: string): Promise<void>;
  hasCollection(collectionName: string): Promise<boolean>;
  listCollections(): Promise<string[]>;
  insert(collectionName: string, documents: VectorDocument[]): Promise<void>;
  search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]>;
  delete(collectionName: string, ids: string[]): Promise<void>;
  query(
    collectionName: string,
    filter: string,
    outputFields: string[],
    limit?: number,
  ): Promise<Record<string, unknown>[]>;
  getCollectionRowCount(collectionName: string): Promise<number>;
}
