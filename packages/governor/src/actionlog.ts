import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export type ActionKind =
  | 'shell'
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'agent_start'
  | 'agent_end'
  | 'worktree_create'
  | 'worktree_merge'
  | 'worktree_rollback';

export interface ActionEntry {
  ts: number;
  taskId: string;
  kind: ActionKind;
  payload: Record<string, unknown>;
}

export class ActionLog {
  private readonly _path: string;

  constructor(logPath: string) {
    this._path = logPath;
    mkdirSync(dirname(logPath), { recursive: true });
  }

  append(entry: Omit<ActionEntry, 'ts'>): void {
    const line = JSON.stringify({ ts: Date.now(), ...entry }) + '\n';
    appendFileSync(this._path, line, 'utf8');
  }

  readAll(): ActionEntry[] {
    if (!existsSync(this._path)) return [];
    return readFileSync(this._path, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ActionEntry);
  }

  forTask(taskId: string): ActionEntry[] {
    return this.readAll().filter((e) => e.taskId === taskId);
  }

  taskIds(): string[] {
    return [...new Set(this.readAll().map((e) => e.taskId))];
  }
}

export function defaultLogPath(repoRoot: string): string {
  return join(repoRoot, '.coderelay', 'action.log');
}
