import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ActionLog } from '../actionlog.js';

let tmpDir: string;
let logPath: string;
let al: ActionLog;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'coderelay-actionlog-'));
  logPath = join(tmpDir, 'action.log');
  al = new ActionLog(logPath);
});

describe('ActionLog', () => {
  it('starts empty', () => {
    expect(al.readAll()).toEqual([]);
  });

  it('appends and reads back entries', () => {
    al.append({ taskId: 'task-1', kind: 'shell', payload: { cmd: 'ls' } });
    al.append({ taskId: 'task-1', kind: 'file_write', payload: { path: '/tmp/foo.ts' } });
    const all = al.readAll();
    expect(all).toHaveLength(2);
    expect(all[0].kind).toBe('shell');
    expect(all[0].taskId).toBe('task-1');
    expect(all[1].kind).toBe('file_write');
  });

  it('each entry has a numeric ts', () => {
    const before = Date.now();
    al.append({ taskId: 't', kind: 'agent_start', payload: {} });
    const after = Date.now();
    const [e] = al.readAll();
    expect(e.ts).toBeGreaterThanOrEqual(before);
    expect(e.ts).toBeLessThanOrEqual(after);
  });

  it('forTask filters by taskId', () => {
    al.append({ taskId: 'task-a', kind: 'shell', payload: {} });
    al.append({ taskId: 'task-b', kind: 'shell', payload: {} });
    al.append({ taskId: 'task-a', kind: 'agent_end', payload: {} });

    expect(al.forTask('task-a')).toHaveLength(2);
    expect(al.forTask('task-b')).toHaveLength(1);
    expect(al.forTask('task-c')).toHaveLength(0);
  });

  it('taskIds returns unique task IDs', () => {
    al.append({ taskId: 'x', kind: 'shell', payload: {} });
    al.append({ taskId: 'y', kind: 'shell', payload: {} });
    al.append({ taskId: 'x', kind: 'file_write', payload: {} });
    const ids = al.taskIds();
    expect(ids).toHaveLength(2);
    expect(ids).toContain('x');
    expect(ids).toContain('y');
  });

  it('persists across ActionLog instances (append-only JSONL)', () => {
    al.append({ taskId: 't1', kind: 'worktree_create', payload: { branch: 'coderelay/task-abc' } });
    // new instance reads same file
    const al2 = new ActionLog(logPath);
    const entries = al2.readAll();
    expect(entries).toHaveLength(1);
    expect((entries[0].payload as { branch: string }).branch).toBe('coderelay/task-abc');
  });

  it('handles many entries robustly', () => {
    for (let i = 0; i < 100; i++) {
      al.append({ taskId: `task-${i % 5}`, kind: 'file_read', payload: { i } });
    }
    expect(al.readAll()).toHaveLength(100);
    expect(al.taskIds()).toHaveLength(5);
  });
});
