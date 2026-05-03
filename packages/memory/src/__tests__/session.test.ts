import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionMemory } from '../session.js';
import type { TurnRow } from '../session.js';

let mem: SessionMemory;

beforeEach(() => { mem = new SessionMemory({ dbPath: ':memory:' }); });
afterEach(() => { mem.close(); });

describe('SessionMemory', () => {
  it('openSession returns a string ID', () => {
    const id = mem.openSession();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('openSession with explicit ID reuses it', () => {
    const id = mem.openSession('my-session');
    expect(id).toBe('my-session');
    const row = mem.getSession('my-session');
    expect(row).toBeDefined();
    expect(row!.id).toBe('my-session');
  });

  it('openSession called twice with same ID is idempotent', () => {
    mem.openSession('s1');
    mem.openSession('s1');
    const row = mem.getSession('s1');
    expect(row).toBeDefined();
  });

  it('addTurn persists turns in order', async () => {
    const sid = mem.openSession();
    await mem.addTurn(sid, 'user', 'hello');
    await mem.addTurn(sid, 'assistant', 'hi');
    const turns = mem.getTurns(sid);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.role).toBe('user');
    expect(turns[0]!.content).toBe('hello');
    expect(turns[1]!.role).toBe('assistant');
  });

  it('getTurns with limit returns only N most-recent', async () => {
    const sid = mem.openSession();
    for (let i = 0; i < 5; i++) await mem.addTurn(sid, 'user', `msg-${i}`);
    const turns = mem.getTurns(sid, 3);
    expect(turns).toHaveLength(3);
  });

  it('getSession returns updated_at after addTurn', async () => {
    const sid = mem.openSession();
    const before = mem.getSession(sid)!.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    await mem.addTurn(sid, 'user', 'ping');
    const after = mem.getSession(sid)!.updated_at;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('summary starts as null', () => {
    const sid = mem.openSession();
    expect(mem.getSession(sid)!.summary).toBeNull();
  });

  it('auto-summarize fires at summarizeEvery and writes summary row', async () => {
    const calls: TurnRow[][] = [];
    const m = new SessionMemory({
      dbPath: ':memory:',
      summarizeEvery: 5,
      keepAfterSummarize: 2,
      summarize: async (turns) => { calls.push(turns); return 'SUMMARY'; },
    });

    const sid = m.openSession();
    for (let i = 0; i < 5; i++) await m.addTurn(sid, 'user', `t${i}`);

    expect(calls).toHaveLength(1);
    expect(m.getSession(sid)!.summary).toBe('SUMMARY');
    m.close();
  });

  it('after auto-summarize, only keepAfterSummarize turns remain active', async () => {
    const m = new SessionMemory({
      dbPath: ':memory:',
      summarizeEvery: 5,
      keepAfterSummarize: 2,
      summarize: async () => 'SUMMARY',
    });

    const sid = m.openSession();
    for (let i = 0; i < 5; i++) await m.addTurn(sid, 'user', `t${i}`);

    const remaining = m.getTurns(sid);
    expect(remaining).toHaveLength(2);
    m.close();
  });

  it('summarize receives all turns before archiving', async () => {
    let captured: TurnRow[] = [];
    const m = new SessionMemory({
      dbPath: ':memory:',
      summarizeEvery: 3,
      keepAfterSummarize: 1,
      summarize: async (turns) => { captured = turns; return 'S'; },
    });

    const sid = m.openSession();
    await m.addTurn(sid, 'user', 'a');
    await m.addTurn(sid, 'assistant', 'b');
    await m.addTurn(sid, 'user', 'c');

    expect(captured).toHaveLength(3);
    expect(captured.map((t) => t.content)).toEqual(['a', 'b', 'c']);
    m.close();
  });

  it('after 25 turns with summarizeEvery=20, summary exists and turns are pruned', async () => {
    const m = new SessionMemory({
      dbPath: ':memory:',
      summarizeEvery: 20,
      keepAfterSummarize: 5,
      summarize: async () => 'AUTO-SUMMARY',
    });

    const sid = m.openSession();
    for (let i = 0; i < 25; i++) await m.addTurn(sid, 'user', `msg-${i}`);

    expect(m.getSession(sid)!.summary).toBe('AUTO-SUMMARY');
    const remaining = m.getTurns(sid);
    // summarize fired at 20, kept 5; then 5 more added = 10 active
    expect(remaining.length).toBeLessThanOrEqual(10);
    m.close();
  });
});
