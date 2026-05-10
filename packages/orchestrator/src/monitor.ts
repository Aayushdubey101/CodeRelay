import { checkBlocklist } from '@coderelay/governor';

export type MonitorEventType = 'context_drift' | 'scope_violation' | 'budget_exceeded';
export type MonitorSeverity = 'warning' | 'error';

export interface MonitorEvent {
  type: MonitorEventType;
  detail: string;
  step: number;
  severity: MonitorSeverity;
}

export interface BudgetState {
  used: number;
  total: number;
}

export class OrchestratorMonitor {
  /** Warn when token usage exceeds this fraction of budget (default 90%). */
  private readonly warnThreshold: number;

  constructor(opts?: { warnThreshold?: number }) {
    this.warnThreshold = opts?.warnThreshold ?? 0.9;
  }

  checkBudget(state: BudgetState, step: number): MonitorEvent | null {
    if (state.total === 0) return null;
    const ratio = state.used / state.total;
    if (ratio >= 1.0) {
      return {
        type: 'budget_exceeded',
        detail: `Token budget exhausted: ${state.used}/${state.total} used`,
        step,
        severity: 'error',
      };
    }
    if (ratio >= this.warnThreshold) {
      return {
        type: 'budget_exceeded',
        detail: `Token budget ${Math.round(ratio * 100)}% used (${state.used}/${state.total})`,
        step,
        severity: 'warning',
      };
    }
    return null;
  }

  checkContextDrift(
    expectedFiles: string[],
    changedFiles: string[],
    step: number,
  ): MonitorEvent | null {
    if (expectedFiles.length === 0 || changedFiles.length === 0) return null;

    const unexpected = changedFiles.filter(
      changed => !expectedFiles.some(expected =>
        changed.includes(expected) || expected.includes(changed),
      ),
    );

    if (unexpected.length > 0) {
      return {
        type: 'context_drift',
        detail: `Unexpected files changed: ${unexpected.join(', ')}`,
        step,
        severity: 'warning',
      };
    }
    return null;
  }

  checkScope(command: string, step: number): MonitorEvent | null {
    const block = checkBlocklist(command);
    if (block !== null) {
      return {
        type: 'scope_violation',
        detail: `Blocked command [${block.pattern}]: ${block.reason}`,
        step,
        severity: 'error',
      };
    }
    return null;
  }

  checkAll(opts: {
    budget?: BudgetState;
    expectedFiles?: string[];
    changedFiles?: string[];
    command?: string;
    step: number;
  }): MonitorEvent[] {
    const events: MonitorEvent[] = [];

    if (opts.budget) {
      const e = this.checkBudget(opts.budget, opts.step);
      if (e) events.push(e);
    }

    if (opts.expectedFiles && opts.changedFiles) {
      const e = this.checkContextDrift(opts.expectedFiles, opts.changedFiles, opts.step);
      if (e) events.push(e);
    }

    if (opts.command) {
      const e = this.checkScope(opts.command, opts.step);
      if (e) events.push(e);
    }

    return events;
  }
}
