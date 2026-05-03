import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextManifest } from '../manifest.js';

let cm: ContextManifest;

beforeEach(() => { cm = new ContextManifest(':memory:'); });
afterEach(() => { cm.close(); });

describe('ContextManifest', () => {
  it('hasManifest false for unknown task', () => {
    expect(cm.hasManifest('t1')).toBe(false);
  });

  it('record and hasManifest', () => {
    cm.record('t1', { file: 'src/auth.ts', tokens: 100, reason: 'contains auth logic' });
    expect(cm.hasManifest('t1')).toBe(true);
  });

  it('getManifest returns recorded entries', () => {
    cm.record('t1', { file: 'src/a.ts', symbol: 'login', tokens: 50, reason: 'login fn' });
    cm.record('t1', { file: 'src/b.ts', tokens: 80, reason: 'imports' });
    const entries = cm.getManifest('t1');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.file).toBe('src/a.ts');
    expect(entries[0]!.symbol).toBe('login');
    expect(entries[1]!.file).toBe('src/b.ts');
  });

  it('totalTokens sums tokens for a task', () => {
    cm.record('t1', { file: 'a.ts', tokens: 100, reason: '' });
    cm.record('t1', { file: 'b.ts', tokens: 200, reason: '' });
    expect(cm.totalTokens('t1')).toBe(300);
  });

  it('totalTokens returns 0 for unknown task', () => {
    expect(cm.totalTokens('ghost')).toBe(0);
  });

  it('tasks are isolated', () => {
    cm.record('t1', { file: 'a.ts', tokens: 10, reason: '' });
    cm.record('t2', { file: 'b.ts', tokens: 20, reason: '' });
    expect(cm.getManifest('t1')).toHaveLength(1);
    expect(cm.getManifest('t2')).toHaveLength(1);
    expect(cm.totalTokens('t1')).toBe(10);
    expect(cm.totalTokens('t2')).toBe(20);
  });

  it('duplicate entry updates tokens/reason, no new row', () => {
    cm.record('t1', { file: 'a.ts', symbol: 'fn', chunk_id: 'c1', tokens: 50, reason: 'v1' });
    cm.record('t1', { file: 'a.ts', symbol: 'fn', chunk_id: 'c1', tokens: 60, reason: 'v2' });
    const entries = cm.getManifest('t1');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tokens).toBe(60);
    expect(entries[0]!.reason).toBe('v2');
  });

  it('clear removes only the target task', () => {
    cm.record('t1', { file: 'a.ts', tokens: 10, reason: '' });
    cm.record('t2', { file: 'b.ts', tokens: 20, reason: '' });
    cm.clear('t1');
    expect(cm.hasManifest('t1')).toBe(false);
    expect(cm.hasManifest('t2')).toBe(true);
  });

  it('second run of same task uses existing manifest', () => {
    const entry = { file: 'src/auth.ts', symbol: 'authenticate', tokens: 120, reason: 'auth fn' };
    cm.record('task-abc', entry);

    // Simulate second run: check manifest exists, skip re-parsing
    expect(cm.hasManifest('task-abc')).toBe(true);
    const manifest = cm.getManifest('task-abc');
    expect(manifest[0]!.file).toBe('src/auth.ts');
    expect(manifest[0]!.tokens).toBe(120);
  });
});
