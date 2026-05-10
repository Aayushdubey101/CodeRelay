import { describe, it, expect, vi } from 'vitest';
import { OrchestratorRunner } from './orchestratorRunner.js';
import type { OrchestratorOptions } from './orchestratorRunner.js';

function makeMockDb() {
  return {
    prepare: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([{ content: 'some code', token_count: 10 }]) }),
  };
}

function makeMockLog() {
  return { append: vi.fn() } as unknown as import('@coderelay/governor').ActionLog;
}

function makeMockWorktree() {
  return { path: '/tmp/test-worktree', branch: 'coderelay/task-test', baseBranch: 'main' } as import('@coderelay/governor').WorktreeInfo;
}

describe('OrchestratorRunner', () => {
  it('calls planner, retriever, executor, verifier, realigner in order', async () => {
    const llmCalls: string[] = [];
    const llm = vi.fn().mockImplementation(async (system: string) => {
      if (system.includes('planner') || system.includes('software')) {
        llmCalls.push('planner');
        return JSON.stringify([{ step: 1, intent: 'Add cache', expectedFiles: ['cache.ts'], toolsNeeded: [] }]);
      }
      if (system.includes('re-aligner') || system.includes('re-align')) {
        llmCalls.push('realigner');
        return JSON.stringify({ driftDetected: false, reason: 'ok', revisedSteps: [] });
      }
      llmCalls.push('memory');
      return JSON.stringify({ facts: [], projectMdLine: null });
    });

    const executor = { execute: vi.fn().mockResolvedValue({ step: 1, output: 'done', durationMs: 100, success: true }) };
    const verifier = { verify: vi.fn().mockResolvedValue({ passed: true, checks: [] }) };

    const opts: OrchestratorOptions = {
      graphDb: makeMockDb(),
      vector: null,
      llm,
      log: makeMockLog(),
      worktree: makeMockWorktree(),
    };

    const runner = new OrchestratorRunner(opts);
    // @ts-expect-error - inject mocks
    runner['executor'] = executor;
    // @ts-expect-error - inject mocks
    runner['verifier'] = verifier;

    const result = await runner.run('add caching to UserService');
    expect(result.steps).toHaveLength(1);
    expect(result.results).toHaveLength(1);
    expect(result.verifications).toHaveLength(1);
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(verifier.verify).toHaveBeenCalledTimes(1);
  });

  it('returns taskId as a UUID string', async () => {
    const llm = vi.fn()
      .mockResolvedValueOnce(JSON.stringify([{ step: 1, intent: 'x', expectedFiles: [], toolsNeeded: [] }]))
      .mockResolvedValue(JSON.stringify({ driftDetected: false, reason: '', revisedSteps: [] }));

    const opts: OrchestratorOptions = {
      graphDb: makeMockDb(),
      vector: null,
      llm,
      log: makeMockLog(),
      worktree: makeMockWorktree(),
    };

    const runner = new OrchestratorRunner(opts);
    // @ts-expect-error - inject mock
    runner['executor'] = { execute: vi.fn().mockResolvedValue({ step: 1, output: 'ok', durationMs: 50, success: true }) };
    // @ts-expect-error - inject mock
    runner['verifier'] = { verify: vi.fn().mockResolvedValue({ passed: true, checks: [] }) };

    const result = await runner.run('some task');
    expect(result.taskId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('calls remember and appendToProjectMd when provided', async () => {
    const llm = vi.fn()
      .mockResolvedValueOnce(JSON.stringify([{ step: 1, intent: 'refactor', expectedFiles: ['a.ts'], toolsNeeded: [] }]))
      .mockResolvedValue(JSON.stringify({ facts: ['used LanceDB'], projectMdLine: 'Switched vector store' }));

    const remember = vi.fn().mockResolvedValue(undefined);
    const appendToProjectMd = vi.fn().mockResolvedValue(undefined);

    const opts: OrchestratorOptions = {
      graphDb: makeMockDb(),
      vector: null,
      llm,
      log: makeMockLog(),
      worktree: makeMockWorktree(),
      remember,
      appendToProjectMd,
    };

    const runner = new OrchestratorRunner(opts);
    // @ts-expect-error - inject mock
    runner['executor'] = { execute: vi.fn().mockResolvedValue({ step: 1, output: 'done', durationMs: 80, success: true }) };
    // @ts-expect-error - inject mock
    runner['verifier'] = { verify: vi.fn().mockResolvedValue({ passed: true, checks: [] }) };

    const result = await runner.run('refactor auth');
    expect(result.factsWritten).toBe(1);
    expect(remember).toHaveBeenCalledWith('used LanceDB', expect.any(Array));
  });
});
