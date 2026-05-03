import { describe, it, expect, beforeEach } from 'vitest';
import { WorkingMemory } from '../working.js';

let mem: WorkingMemory;

beforeEach(() => { mem = new WorkingMemory(); });

describe('WorkingMemory', () => {
  it('set and get values within a task', () => {
    mem.set('t1', 'foo', 42);
    expect(mem.get('t1', 'foo')).toBe(42);
  });

  it('two tasks are isolated — writes do not bleed across IDs', () => {
    mem.set('t1', 'key', 'task-one-value');
    mem.set('t2', 'key', 'task-two-value');

    expect(mem.get('t1', 'key')).toBe('task-one-value');
    expect(mem.get('t2', 'key')).toBe('task-two-value');
  });

  it('missing key returns undefined', () => {
    expect(mem.get('t1', 'nope')).toBeUndefined();
  });

  it('delete removes a key', () => {
    mem.set('t1', 'x', 1);
    expect(mem.delete('t1', 'x')).toBe(true);
    expect(mem.get('t1', 'x')).toBeUndefined();
  });

  it('delete on missing key returns false', () => {
    expect(mem.delete('t1', 'ghost')).toBe(false);
  });

  it('clear wipes only the target task', () => {
    mem.set('t1', 'a', 1);
    mem.set('t2', 'b', 2);
    mem.clear('t1');

    expect(mem.get('t1', 'a')).toBeUndefined();
    expect(mem.get('t2', 'b')).toBe(2);
  });

  it('keys returns all keys for a task', () => {
    mem.set('t1', 'a', 1);
    mem.set('t1', 'b', 2);
    expect(mem.keys('t1').sort()).toEqual(['a', 'b']);
  });

  it('keys returns empty array for unknown task', () => {
    expect(mem.keys('unknown')).toEqual([]);
  });

  it('has checks existence correctly', () => {
    mem.set('t1', 'x', 0);
    expect(mem.has('t1', 'x')).toBe(true);
    expect(mem.has('t1', 'y')).toBe(false);
    expect(mem.has('t2', 'x')).toBe(false);
  });

  it('parallel tasks see only their own updates', () => {
    const taskIds = ['alpha', 'beta', 'gamma'];
    for (const id of taskIds) mem.set(id, 'result', `done-${id}`);
    for (const id of taskIds) expect(mem.get(id, 'result')).toBe(`done-${id}`);
  });
});
