import { execa } from 'execa';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface WorktreeInfo {
  taskId: string;
  branch: string;
  path: string;
  baseRef: string;
}

export interface WorktreeOptions {
  repoRoot?: string;
  sandboxBase?: string;
}

async function git(args: string[], cwd: string): Promise<string> {
  const r = await execa('git', args, { cwd, reject: false });
  return r.stdout.trim();
}

async function currentBranch(cwd: string): Promise<string> {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

async function currentRef(cwd: string): Promise<string> {
  return git(['rev-parse', 'HEAD'], cwd);
}

export async function createWorktree(opts: WorktreeOptions = {}): Promise<WorktreeInfo> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const sandboxBase = opts.sandboxBase ?? join(repoRoot, '.coderelay', 'worktrees');
  mkdirSync(sandboxBase, { recursive: true });

  const taskId = randomUUID();
  const branch = `coderelay/task-${taskId.slice(0, 8)}`;
  const worktreePath = join(sandboxBase, taskId);
  const baseRef = await currentRef(repoRoot);

  await execa('git', ['worktree', 'add', '-b', branch, worktreePath], { cwd: repoRoot });

  return { taskId, branch, path: worktreePath, baseRef };
}

export async function removeWorktree(info: WorktreeInfo, opts: WorktreeOptions = {}): Promise<void> {
  const repoRoot = opts.repoRoot ?? process.cwd();

  if (existsSync(info.path)) {
    await execa('git', ['worktree', 'remove', '--force', info.path], { cwd: repoRoot, reject: false });
    try { rmSync(info.path, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  await execa('git', ['branch', '-D', info.branch], { cwd: repoRoot, reject: false });
}

export async function mergeWorktree(
  info: WorktreeInfo,
  targetBranch?: string,
  opts: WorktreeOptions = {},
): Promise<void> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const target = targetBranch ?? (await currentBranch(repoRoot));

  await execa('git', ['checkout', target], { cwd: repoRoot });
  await execa('git', ['merge', '--no-ff', info.branch, '-m', `Merge coderelay task ${info.taskId}`], { cwd: repoRoot });
  await removeWorktree(info, opts);
}

export async function rollbackWorktree(info: WorktreeInfo, opts: WorktreeOptions = {}): Promise<void> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  await removeWorktree(info, opts);
  // Rollback is achieved by simply deleting the worktree and branch — main stays untouched
  void repoRoot;
}
