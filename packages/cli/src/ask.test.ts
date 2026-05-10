import { describe, it, expect } from 'vitest';
import { formatResult } from './ask.js';

describe('formatResult', () => {
  const baseResult = {
    taskId: '550e8400-e29b-41d4-a716-446655440000',
    steps: [],
    results: [{ step: 1, output: 'done', durationMs: 100, success: true }],
    verifications: [{ passed: true, checks: [] }],
    factsWritten: 2,
    driftDetected: false,
  };

  it('includes short taskId prefix', () => {
    const text = formatResult(baseResult);
    expect(text).toContain('550e8400');
  });

  it('shows facts written count', () => {
    const text = formatResult(baseResult);
    expect(text).toContain('2');
  });

  it('shows drift=no when not detected', () => {
    const text = formatResult(baseResult);
    expect(text).toContain('no');
  });

  it('shows drift=yes (replanned) when detected', () => {
    const text = formatResult({ ...baseResult, driftDetected: true });
    expect(text).toContain('yes');
  });

  it('shows verification pass ratio', () => {
    const text = formatResult({
      ...baseResult,
      verifications: [{ passed: true, checks: [] }, { passed: false, checks: [] }],
    });
    expect(text).toContain('1/2');
  });
});
