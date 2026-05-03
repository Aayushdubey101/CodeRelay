import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { LanceVectorStore } from '../upstream/vectordb/lancedb.js';
import type { VectorDocument } from '../upstream/vectordb/types.js';

const DIM = 4;
const DB_PATH = join(tmpdir(), `coderelay-lance-test-${process.pid}`);

function makeDoc(id: string, vector: number[], content: string): VectorDocument {
  return {
    id,
    vector,
    content,
    relativePath: `src/${id}.ts`,
    startLine: 1,
    endLine: 10,
    fileExtension: '.ts',
    metadata: { tag: id },
  };
}

afterEach(() => {
  try {
    rmSync(DB_PATH, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe('LanceVectorStore', () => {
  it('round-trip: insert then search returns inserted doc', async () => {
    mkdirSync(DB_PATH, { recursive: true });
    const store = await LanceVectorStore.open(DB_PATH);

    await store.createCollection('chunks', DIM);

    const docs = [
      makeDoc('a', [1, 0, 0, 0], 'function alpha'),
      makeDoc('b', [0, 1, 0, 0], 'function beta'),
      makeDoc('c', [0, 0, 1, 0], 'function gamma'),
    ];
    await store.insert('chunks', docs);

    // Query closest to doc 'a'
    const results = await store.search('chunks', [1, 0, 0, 0], { topK: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]?.document.id).toBe('a');
    expect(results[0]?.document.content).toBe('function alpha');
  });

  it('hasCollection returns correct values', async () => {
    mkdirSync(DB_PATH, { recursive: true });
    const store = await LanceVectorStore.open(DB_PATH);

    expect(await store.hasCollection('chunks')).toBe(false);
    await store.createCollection('chunks', DIM);
    await store.insert('chunks', [makeDoc('x', [1, 0, 0, 0], 'x')]);
    expect(await store.hasCollection('chunks')).toBe(true);
  });

  it('listCollections returns created tables', async () => {
    mkdirSync(DB_PATH, { recursive: true });
    const store = await LanceVectorStore.open(DB_PATH);

    await store.createCollection('alpha', DIM);
    await store.insert('alpha', [makeDoc('x', [1, 0, 0, 0], 'x')]);
    await store.createCollection('beta', DIM);
    await store.insert('beta', [makeDoc('y', [0, 1, 0, 0], 'y')]);

    const names = await store.listCollections();
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
  });

  it('getCollectionRowCount returns correct count', async () => {
    mkdirSync(DB_PATH, { recursive: true });
    const store = await LanceVectorStore.open(DB_PATH);

    await store.createCollection('chunks', DIM);
    await store.insert('chunks', [
      makeDoc('a', [1, 0, 0, 0], 'a'),
      makeDoc('b', [0, 1, 0, 0], 'b'),
    ]);

    expect(await store.getCollectionRowCount('chunks')).toBe(2);
  });

  it('delete removes rows by id', async () => {
    mkdirSync(DB_PATH, { recursive: true });
    const store = await LanceVectorStore.open(DB_PATH);

    await store.createCollection('chunks', DIM);
    await store.insert('chunks', [
      makeDoc('a', [1, 0, 0, 0], 'a'),
      makeDoc('b', [0, 1, 0, 0], 'b'),
      makeDoc('c', [0, 0, 1, 0], 'c'),
    ]);

    await store.delete('chunks', ['a', 'c']);
    expect(await store.getCollectionRowCount('chunks')).toBe(1);

    const results = await store.search('chunks', [0, 1, 0, 0], { topK: 5 });
    const ids = results.map((r) => r.document.id);
    expect(ids).toContain('b');
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('c');
  });

  it('metadata survives round-trip', async () => {
    mkdirSync(DB_PATH, { recursive: true });
    const store = await LanceVectorStore.open(DB_PATH);

    await store.createCollection('chunks', DIM);
    await store.insert('chunks', [makeDoc('a', [1, 0, 0, 0], 'alpha')]);

    const results = await store.search('chunks', [1, 0, 0, 0], { topK: 1 });
    expect(results[0]?.document.metadata).toEqual({ tag: 'a' });
  });

  it('dropCollection removes the table', async () => {
    mkdirSync(DB_PATH, { recursive: true });
    const store = await LanceVectorStore.open(DB_PATH);

    await store.createCollection('chunks', DIM);
    await store.insert('chunks', [makeDoc('a', [1, 0, 0, 0], 'a')]);
    expect(await store.hasCollection('chunks')).toBe(true);

    await store.dropCollection('chunks');
    expect(await store.hasCollection('chunks')).toBe(false);
  });
});
