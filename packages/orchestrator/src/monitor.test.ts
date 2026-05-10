import { describe, it, expect } from 'vitest';
import { OrchestratorMonitor } from './monitor.js';

describe('OrchestratorMonitor', () => {
  const monitor = new OrchestratorMonitor();

  describe('checkBudget', () => {
    it('returns null when usage is under threshold', () => {
      expect(monitor.checkBudget({ used: 500, total: 8000 }, 1)).toBeNull();
    });

    it('returns warning when over 90% used', () => {
      const e = monitor.checkBudget({ used: 7500, total: 8000 }, 2);
      expect(e).not.toBeNull();
      expect(e!.severity).toBe('warning');
      expect(e!.type).toBe('budget_exceeded');
    });

    it('returns error when budget fully exhausted', () => {
      const e = monitor.checkBudget({ used: 8000, total: 8000 }, 3);
      expect(e!.severity).toBe('error');
    });

    it('returns null when total is 0', () => {
      expect(monitor.checkBudget({ used: 0, total: 0 }, 1)).toBeNull();
    });
  });

  describe('checkContextDrift', () => {
    it('returns null when all changed files are expected', () => {
      const e = monitor.checkContextDrift(['src/auth.ts', 'src/cache.ts'], ['src/auth.ts'], 1);
      expect(e).toBeNull();
    });

    it('returns warning on unexpected file change', () => {
      const e = monitor.checkContextDrift(['src/auth.ts'], ['src/auth.ts', 'src/unrelated.ts'], 2);
      expect(e).not.toBeNull();
      expect(e!.type).toBe('context_drift');
      expect(e!.detail).toContain('unrelated.ts');
    });

    it('returns null when expectedFiles is empty', () => {
      expect(monitor.checkContextDrift([], ['src/foo.ts'], 1)).toBeNull();
    });
  });

  describe('checkScope', () => {
    it('returns null for safe commands', () => {
      expect(monitor.checkScope('npm test', 1)).toBeNull();
      expect(monitor.checkScope('git status', 1)).toBeNull();
    });

    it('returns error for blocklisted commands', () => {
      const e = monitor.checkScope('rm -rf /tmp/build', 1);
      expect(e).not.toBeNull();
      expect(e!.type).toBe('scope_violation');
      expect(e!.severity).toBe('error');
    });

    it('blocks DROP TABLE', () => {
      const e = monitor.checkScope('DROP TABLE users', 1);
      expect(e!.type).toBe('scope_violation');
    });
  });

  describe('checkAll', () => {
    it('aggregates multiple events', () => {
      const events = monitor.checkAll({
        budget: { used: 7900, total: 8000 },
        expectedFiles: ['src/auth.ts'],
        changedFiles: ['src/auth.ts', 'src/rogue.ts'],
        step: 1,
      });
      expect(events.length).toBe(2);
      expect(events.map(e => e.type)).toContain('budget_exceeded');
      expect(events.map(e => e.type)).toContain('context_drift');
    });

    it('returns empty array when all clear', () => {
      const events = monitor.checkAll({
        budget: { used: 100, total: 8000 },
        expectedFiles: ['src/a.ts'],
        changedFiles: ['src/a.ts'],
        step: 1,
      });
      expect(events).toHaveLength(0);
    });
  });
});
