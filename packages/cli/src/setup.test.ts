import { describe, it, expect } from 'vitest';
import { gatherChecks, printChecks } from './setup.js';

describe('gatherChecks', () => {
  const mockChecker = async (_cmd: string, _args: string[]) => ({ ok: true, detail: 'mock v1.0.0' });
  const failChecker = async (_cmd: string, _args: string[]) => ({ ok: false, detail: 'not found' });

  it('includes Node.js check that passes for the running process', async () => {
    const checks = await gatherChecks(mockChecker);
    const node = checks.find(c => c.name === 'Node.js >=20');
    expect(node).toBeDefined();
    expect(node!.detail).toBe(process.version);
    // running test on Node 20+ — must pass
    expect(node!.ok).toBe(parseInt(process.version.slice(1), 10) >= 20);
  });

  it('marks pnpm, git, Node.js, and ~/.coderelay/ as required', async () => {
    const checks = await gatherChecks(mockChecker);
    const required = checks.filter(c => c.required).map(c => c.name);
    expect(required).toContain('pnpm');
    expect(required).toContain('git');
    expect(required).toContain('Node.js >=20');
    expect(required).toContain('~/.coderelay/');
  });

  it('marks claude CLI, gemini CLI, ollama as optional', async () => {
    const checks = await gatherChecks(failChecker);
    const claude = checks.find(c => c.name === 'claude CLI');
    const gemini = checks.find(c => c.name === 'gemini CLI');
    const ollama = checks.find(c => c.name === 'ollama');
    expect(claude!.required).toBe(false);
    expect(gemini!.required).toBe(false);
    expect(ollama!.required).toBe(false);
  });
});

describe('printChecks', () => {
  it('does not throw on empty list', () => {
    expect(() => printChecks([])).not.toThrow();
  });

  it('does not throw on mixed ok/fail rows', () => {
    expect(() => printChecks([
      { name: 'Tool A', required: true, ok: true, detail: 'v1' },
      { name: 'Tool B', required: false, ok: false, detail: 'missing' },
    ])).not.toThrow();
  });
});
