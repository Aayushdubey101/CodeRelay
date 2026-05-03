import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LongTermMemory } from '../longterm.js';

let mem: LongTermMemory;

beforeEach(() => { mem = new LongTermMemory({ dbPath: ':memory:' }); });
afterEach(() => { mem.close(); });

describe('LongTermMemory', () => {
  it('recordFact returns a string ID', async () => {
    const id = await mem.recordFact('auth uses JWT');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('stored fact appears in getAllFacts', async () => {
    await mem.recordFact('the database is PostgreSQL');
    const facts = mem.getAllFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0]!.text).toBe('the database is PostgreSQL');
  });

  it('searchText LIKE finds matching facts', async () => {
    await mem.recordFact('auth flow uses OAuth2');
    await mem.recordFact('cache layer is Redis');
    await mem.recordFact('auth token expires in 1 hour');

    const results = await mem.searchText('auth');
    expect(results.length).toBe(2);
    expect(results.every((r) => r.text.includes('auth'))).toBe(true);
  });

  it('searchText returns empty when no match', async () => {
    await mem.recordFact('the sky is blue');
    const results = await mem.searchText('database');
    expect(results).toHaveLength(0);
  });

  it('searchText respects limit', async () => {
    for (let i = 0; i < 10; i++) await mem.recordFact(`fact about auth ${i}`);
    const results = await mem.searchText('auth', 3);
    expect(results).toHaveLength(3);
  });

  it('deleteFact removes the fact', async () => {
    const id = await mem.recordFact('temporary fact');
    mem.deleteFact(id);
    const facts = mem.getAllFacts();
    expect(facts).toHaveLength(0);
  });

  it('tags are stored and returned', async () => {
    await mem.recordFact('auth uses JWT', ['auth', 'security']);
    const facts = mem.getAllFacts();
    expect(facts[0]!.tags).toContain('auth');
    expect(facts[0]!.tags).toContain('security');
  });

  it('vector search ranks by cosine similarity', async () => {
    const dim = 4;
    const mockEmbedding = {
      embed: async (texts: string[]) =>
        texts.map((t) =>
          t.includes('auth')
            ? [1, 0, 0, 0]
            : t.includes('cache')
              ? [0, 1, 0, 0]
              : [0, 0, 0, 1],
        ),
      getDimension: () => dim,
    };

    const m = new LongTermMemory({ dbPath: ':memory:', embedding: mockEmbedding });
    await m.recordFact('auth flow uses OAuth2');
    await m.recordFact('cache layer is Redis');
    await m.recordFact('unrelated fact about builds');

    // query vector [1,0,0,0] should rank 'auth' first
    const results = await m.searchText('auth');
    expect(results[0]!.text).toContain('auth');
    m.close();
  });

  it('multiple facts stored in order, getAllFacts returns newest first', async () => {
    await mem.recordFact('first');
    await new Promise((r) => setTimeout(r, 5));
    await mem.recordFact('second');

    const facts = mem.getAllFacts();
    expect(facts[0]!.text).toBe('second');
    expect(facts[1]!.text).toBe('first');
  });
});
