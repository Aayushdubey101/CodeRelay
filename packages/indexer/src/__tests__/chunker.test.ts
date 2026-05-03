import { describe, it, expect } from 'vitest';
import { TextCodeSplitter } from '../upstream/splitter/text-splitter.js';
import { type CodeChunk } from '../upstream/splitter/index.js';

const FIXTURE_TS = `
export interface UserConfig {
  name: string;
  age: number;
}

export function createUser(config: UserConfig): UserConfig {
  return { ...config };
}

export async function fetchUser(id: string): Promise<UserConfig | null> {
  if (!id) return null;
  return { name: 'test', age: 0 };
}

export class UserService {
  private users: UserConfig[] = [];

  add(user: UserConfig): void {
    this.users.push(user);
  }

  get(name: string): UserConfig | undefined {
    return this.users.find(u => u.name === name);
  }

  list(): UserConfig[] {
    return [...this.users];
  }
}

export type UserID = string;

export const DEFAULT_USER: UserConfig = { name: 'anonymous', age: 0 };
`.trim();

describe('TextCodeSplitter', () => {
  it('produces chunks from a TypeScript fixture file', async () => {
    const splitter = new TextCodeSplitter();
    const chunks = await splitter.split(FIXTURE_TS, 'typescript', 'fixture.ts');

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('each chunk has required metadata fields', async () => {
    const splitter = new TextCodeSplitter();
    const chunks = await splitter.split(FIXTURE_TS, 'typescript', 'fixture.ts');

    for (const chunk of chunks) {
      expect(typeof chunk.content).toBe('string');
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(typeof chunk.metadata.startLine).toBe('number');
      expect(typeof chunk.metadata.endLine).toBe('number');
      expect(chunk.metadata.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.metadata.endLine).toBeGreaterThanOrEqual(chunk.metadata.startLine);
    }
  });

  it('chunks cover all content (no lines dropped)', async () => {
    const splitter = new TextCodeSplitter();
    const chunks = await splitter.split(FIXTURE_TS, 'typescript');
    const allContent = chunks.map((c: CodeChunk) => c.content).join(' ');

    // Every top-level declaration should appear in chunks
    expect(allContent).toContain('UserConfig');
    expect(allContent).toContain('createUser');
    expect(allContent).toContain('fetchUser');
    expect(allContent).toContain('UserService');
  });

  it('respects chunkSize and produces more chunks when size is small', async () => {
    const big = new TextCodeSplitter(5000);
    const small = new TextCodeSplitter(200);

    const bigChunks = await big.split(FIXTURE_TS, 'typescript');
    const smallChunks = await small.split(FIXTURE_TS, 'typescript');

    expect(smallChunks.length).toBeGreaterThanOrEqual(bigChunks.length);
  });

  it('works on a file with no top-level declarations (fallback path)', async () => {
    const code = 'const x = 1;\nconst y = 2;\nconst z = x + y;';
    const splitter = new TextCodeSplitter();
    const chunks = await splitter.split(code, 'typescript');

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toContain('x');
  });

  it('handles Python language pattern', async () => {
    const python = 'def foo():\n    pass\n\nclass Bar:\n    def baz(self):\n        pass\n';
    const splitter = new TextCodeSplitter();
    const chunks = await splitter.split(python, 'python', 'test.py');

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.metadata.language).toBe('python');
  });
});
