/* TODO(task 2.5): Replace with real LanceDB implementation.
   Upstream used Milvus (stripped). LanceDB adapter goes here. */

import {
  type VectorDatabase,
  type VectorDocument,
  type SearchOptions,
  type VectorSearchResult,
} from './types.js';

export class LanceDBStub implements VectorDatabase {
  async createCollection(_name: string, _dim: number, _desc?: string): Promise<void> {
    throw new Error('LanceDB not implemented yet — task 2.5');
  }
  async dropCollection(_name: string): Promise<void> {
    throw new Error('LanceDB not implemented yet — task 2.5');
  }
  async hasCollection(_name: string): Promise<boolean> {
    throw new Error('LanceDB not implemented yet — task 2.5');
  }
  async listCollections(): Promise<string[]> {
    throw new Error('LanceDB not implemented yet — task 2.5');
  }
  async insert(_name: string, _docs: VectorDocument[]): Promise<void> {
    throw new Error('LanceDB not implemented yet — task 2.5');
  }
  async search(_name: string, _vec: number[], _opts?: SearchOptions): Promise<VectorSearchResult[]> {
    throw new Error('LanceDB not implemented yet — task 2.5');
  }
  async delete(_name: string, _ids: string[]): Promise<void> {
    throw new Error('LanceDB not implemented yet — task 2.5');
  }
  async query(_name: string, _filter: string, _fields: string[], _limit?: number): Promise<Record<string, unknown>[]> {
    throw new Error('LanceDB not implemented yet — task 2.5');
  }
  async getCollectionRowCount(_name: string): Promise<number> {
    throw new Error('LanceDB not implemented yet — task 2.5');
  }
}
