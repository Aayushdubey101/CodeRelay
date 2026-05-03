import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import { createWorktree, removeWorktree, mergeWorktree, rollbackWorktree } from '../worktree.js';

let repoRoot: string;

async function git(args: string[], cwd: string) {
  await execa('git', args, { cwd });
}

beforeAll(async () => {
  repoRoot = mkdtempSync(join(tmpdir(), 'coderelay-wt-test-'));
  await git(['init', '-b', 'main'], repoRoot);
  await git(['config', 'user.email', 'test@test.com'], repoRoot);
  await git(['config', 'user.name', 'Test'], repoRoot);
  writeFileSync(join(repoRoot, 'README.md'), 'hello');
  await git(['add', '.'], repoRoot);
  await git(['commit', '-m', 'init'], repoRoot);
});

afterAll(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe('createWorktree', () => {
  it('creates worktree with expected shape', async () => {
    const info = await createWorktree({ repoRoot });
    expect(info.taskId).toMatch(/^[0-9a-f-]{36}$/);
    expect(info.branch).toMatch(/^coderelay\/task-/);
    expect(info.baseRef).toMatch(/^[0-9a-f]{40}$/);
    await removeWorktree(info, { repoRoot });
  });

  it('worktree path exists on disk after create', async () => {
    const { existsSync } = await import('node:fs');
    const info = await createWorktree({ repoRoot });
    expect(existsSync(info.path)).toBe(true);
    await removeWorktree(info, { repoRoot });
  });
});

describe('removeWorktree', () => {
  it('removes worktree path and branch', async () => {
    const { existsSync } = await import('node:fs');
    const info = await createWorktree({ repoRoot });
    await removeWorktree(info, { repoRoot });
    expect(existsSync(info.path)).toBe(false);
    // branch should be gone — git branch list should not contain it
    const r = await execa('git', ['branch', '--list', info.branch], { cwd: repoRoot });
    expect(r.stdout.trim()).toBe('');
  });
});

describe('rollbackWorktree', () => {
  it('removes worktree without touching main', async () => {
    const { existsSync } = await import('node:fs');
    const info = await createWorktree({ repoRoot });
    await rollbackWorktree(info, { repoRoot });
    expect(existsSync(info.path)).toBe(false);
    // main still has README.md
    expect(existsSync(join(repoRoot, 'README.md'))).toBe(true);
  });
});

describe('mergeWorktree', () => {
  it('merges branch into main and cleans up', async () => {
    const { existsSync } = await import('node:fs');
    const info = await createWorktree({ repoRoot });
    // commit a file in the worktree branch
    writeFileSync(join(info.path, 'task-file.txt'), 'from worktree');
    await git(['add', '.'], info.path);
    await git(['commit', '-m', 'task work'], info.path);
    await mergeWorktree(info, 'main', { repoRoot });
    // worktree removed
    expect(existsSync(info.path)).toBe(false);
    // merged file present in repoRoot
    expect(existsSync(join(repoRoot, 'task-file.txt'))).toBe(true);
  });
});
