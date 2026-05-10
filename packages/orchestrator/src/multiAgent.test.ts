import { describe, it, expect } from 'vitest';
import { dispatchStep, groupByDependency, DispatchPolicySchema } from './dispatcher.js';
import { mergeResults } from './merger.js';
import type { PlanStep } from './planner.js';
import type { ExecutorResult } from './executor.js';

const policy = DispatchPolicySchema.parse({});

function makeStep(n: number, intent: string, files: string[] = []): PlanStep {
  return { step: n, intent, expectedFiles: files, toolsNeeded: [] };
}

describe('dispatchStep', () => {
  it('routes code-gen intent to claude', () => {
    const step = makeStep(1, 'implement the auth service');
    expect(dispatchStep(step, policy)).toBe('claude');
  });

  it('routes search intent to gemini', () => {
    const step = makeStep(2, 'find all usages of UserService');
    expect(dispatchStep(step, policy)).toBe('gemini');
  });

  it('routes refactor intent to claude', () => {
    const step = makeStep(3, 'rename the method to handleRequest');
    expect(dispatchStep(step, policy)).toBe('claude');
  });

  it('uses default for unknown intent', () => {
    const step = makeStep(4, 'do the thing');
    expect(dispatchStep(step, policy)).toBe('claude');
  });
});

describe('groupByDependency', () => {
  it('groups independent steps in same batch', () => {
    const steps = [
      makeStep(1, 'write a', ['a.ts']),
      makeStep(2, 'write b', ['b.ts']),
    ];
    const groups = groupByDependency(steps);
    expect(groups[0]).toHaveLength(2);
  });

  it('separates steps sharing a file', () => {
    const steps = [
      makeStep(1, 'write a', ['shared.ts']),
      makeStep(2, 'edit a too', ['shared.ts']),
    ];
    const groups = groupByDependency(steps);
    expect(groups).toHaveLength(2);
  });
});

describe('mergeResults', () => {
  it('reports success count', () => {
    const results: ExecutorResult[] = [
      { step: 1, output: '', durationMs: 10, success: true },
      { step: 2, output: '', durationMs: 20, success: false, error: 'oops' },
    ];
    const merged = mergeResults(results, new Map());
    expect(merged.successCount).toBe(1);
    expect(merged.failCount).toBe(1);
  });

  it('detects file conflicts between steps', () => {
    const results: ExecutorResult[] = [
      { step: 1, output: 'Edit: src/auth.ts', durationMs: 10, success: true },
      { step: 2, output: 'Edit: src/auth.ts', durationMs: 10, success: true },
    ];
    const merged = mergeResults(results, new Map([[1, 'claude'], [2, 'gemini']]));
    expect(merged.conflicts.length).toBeGreaterThan(0);
    expect(merged.conflicts[0]?.file).toContain('auth.ts');
  });

  it('returns no conflicts when files are unique', () => {
    const results: ExecutorResult[] = [
      { step: 1, output: 'Edit: src/user.ts', durationMs: 10, success: true },
      { step: 2, output: 'Edit: src/order.ts', durationMs: 10, success: true },
    ];
    const merged = mergeResults(results, new Map());
    expect(merged.conflicts).toHaveLength(0);
  });
});
