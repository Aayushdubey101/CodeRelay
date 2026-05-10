import { describe, it, expect, vi } from 'vitest';
import { Planner } from './planner.js';
import { Retriever } from './retriever.js';
import { Executor } from './executor.js';
import { Realigner } from './realigner.js';
import { MemoryUpdater } from './memoryUpdate.js';

// ── Planner ─────────────────────────────────────────────────────────────────

describe('Planner', () => {
  it('parses a well-formed JSON array', async () => {
    const llm = vi.fn().mockResolvedValue(
      JSON.stringify([
        { step: 1, intent: 'Read auth module', expectedFiles: ['src/auth.ts'], toolsNeeded: ['Read'] },
        { step: 2, intent: 'Add cache', expectedFiles: ['src/cache.ts'], toolsNeeded: ['Edit', 'Write'] },
      ]),
    );
    const planner = new Planner(llm);
    const result = await planner.plan({ task: 'Add caching to auth', repoSummary: 'small ts repo' });
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]!.intent).toBe('Read auth module');
    expect(result.steps[1]!.expectedFiles).toContain('src/cache.ts');
  });

  it('strips markdown code fences', async () => {
    const llm = vi.fn().mockResolvedValue(
      '```json\n[{"step":1,"intent":"x","expectedFiles":[],"toolsNeeded":[]}]\n```',
    );
    const planner = new Planner(llm);
    const result = await planner.plan({ task: 'x', repoSummary: 'y' });
    expect(result.steps).toHaveLength(1);
  });

  it('enforces sequential step numbers', async () => {
    const llm = vi.fn().mockResolvedValue(
      JSON.stringify([
        { step: 99, intent: 'a', expectedFiles: [], toolsNeeded: [] },
        { step: 99, intent: 'b', expectedFiles: [], toolsNeeded: [] },
      ]),
    );
    const planner = new Planner(llm);
    const result = await planner.plan({ task: 't', repoSummary: 'r' });
    expect(result.steps[0]!.step).toBe(1);
    expect(result.steps[1]!.step).toBe(2);
  });

  it('throws on invalid JSON', async () => {
    const llm = vi.fn().mockResolvedValue('not json at all');
    const planner = new Planner(llm);
    await expect(planner.plan({ task: 't', repoSummary: 'r' })).rejects.toThrow('Planner');
  });

  it('throws if response is not an array', async () => {
    const llm = vi.fn().mockResolvedValue('{"step":1}');
    const planner = new Planner(llm);
    await expect(planner.plan({ task: 't', repoSummary: 'r' })).rejects.toThrow();
  });
});

// ── Retriever ────────────────────────────────────────────────────────────────

describe('Retriever', () => {
  function makeDb(rows: { content: string }[]) {
    return {
      prepare: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue(rows) }),
    };
  }

  it('returns chunks from graph db', async () => {
    const db = makeDb([{ content: 'function foo() {}' }]);
    const retriever = new Retriever(db, null, { tokenBudget: 1000 });
    const manifest = await retriever.retrieve({ step: 1, intent: 'add foo', expectedFiles: ['src/foo.ts'], toolsNeeded: [] });
    expect(manifest.chunks).toHaveLength(1);
    expect(manifest.chunks[0]!.source).toBe('graph');
  });

  it('respects token budget', async () => {
    // Each chunk ~25 tokens (100 chars / 4), budget = 30 → only one fits
    const db = makeDb([
      { content: 'a'.repeat(100) },
      { content: 'b'.repeat(100) },
    ]);
    const retriever = new Retriever(db, null, { tokenBudget: 30 });
    const manifest = await retriever.retrieve({ step: 1, intent: 'x', expectedFiles: ['f'], toolsNeeded: [] });
    expect(manifest.chunks).toHaveLength(1);
    expect(manifest.totalTokens).toBeLessThanOrEqual(30);
  });

  it('deduplicates identical chunks', async () => {
    const db = makeDb([{ content: 'same content' }, { content: 'same content' }]);
    const retriever = new Retriever(db, null, { tokenBudget: 10000 });
    const manifest = await retriever.retrieve({ step: 1, intent: 'x', expectedFiles: ['f'], toolsNeeded: [] });
    expect(manifest.chunks).toHaveLength(1);
  });

  it('merges vector hits with graph hits', async () => {
    const db = makeDb([{ content: 'graph chunk' }]);
    const vector = {
      search: vi.fn().mockResolvedValue([
        { content: 'vector chunk', metadata: { filePath: 'src/bar.ts' } },
      ]),
    };
    const retriever = new Retriever(db, vector, { tokenBudget: 10000 });
    const manifest = await retriever.retrieve({ step: 1, intent: 'x', expectedFiles: ['f'], toolsNeeded: [] });
    expect(manifest.chunks.some((c) => c.source === 'vector')).toBe(true);
    expect(manifest.chunks.some((c) => c.source === 'graph')).toBe(true);
  });

  it('survives vector store error', async () => {
    const db = makeDb([{ content: 'graph chunk' }]);
    const vector = { search: vi.fn().mockRejectedValue(new Error('vector down')) };
    const retriever = new Retriever(db, vector, { tokenBudget: 10000 });
    const manifest = await retriever.retrieve({ step: 1, intent: 'x', expectedFiles: ['f'], toolsNeeded: [] });
    expect(manifest.chunks).toHaveLength(1);
  });
});

// ── Realigner ────────────────────────────────────────────────────────────────

describe('Realigner', () => {
  const step1 = { step: 1, intent: 'do x', expectedFiles: ['a.ts'], toolsNeeded: ['Read'] };
  const step2 = { step: 2, intent: 'do y', expectedFiles: ['b.ts'], toolsNeeded: ['Edit'] };

  it('returns no drift when LLM says so', async () => {
    const llm = vi.fn().mockResolvedValue(
      JSON.stringify({ driftDetected: false, reason: 'all good', revisedSteps: [step2] }),
    );
    const realigner = new Realigner(llm);
    const result = await realigner.realign({
      originalTask: 'big task',
      completedSteps: [step1],
      remainingSteps: [step2],
      stepOutcomes: ['done'],
    });
    expect(result.driftDetected).toBe(false);
    expect(result.revisedSteps).toHaveLength(1);
  });

  it('returns drift with revised steps', async () => {
    const revised = { step: 2, intent: 'revised intent', expectedFiles: ['c.ts'], toolsNeeded: ['Write'] };
    const llm = vi.fn().mockResolvedValue(
      JSON.stringify({ driftDetected: true, reason: 'plan outdated', revisedSteps: [revised] }),
    );
    const realigner = new Realigner(llm);
    const result = await realigner.realign({
      originalTask: 'big task',
      completedSteps: [step1],
      remainingSteps: [step2],
      stepOutcomes: ['done'],
    });
    expect(result.driftDetected).toBe(true);
    expect(result.revisedSteps[0]!.intent).toBe('revised intent');
  });

  it('returns no drift on empty remaining steps without calling LLM', async () => {
    const llm = vi.fn();
    const realigner = new Realigner(llm);
    const result = await realigner.realign({
      originalTask: 't',
      completedSteps: [step1],
      remainingSteps: [],
      stepOutcomes: ['done'],
    });
    expect(result.driftDetected).toBe(false);
    expect(llm).not.toHaveBeenCalled();
  });

  it('falls back to original plan on parse error', async () => {
    const llm = vi.fn().mockResolvedValue('not json');
    const realigner = new Realigner(llm);
    const result = await realigner.realign({
      originalTask: 't',
      completedSteps: [],
      remainingSteps: [step2],
      stepOutcomes: [],
    });
    expect(result.driftDetected).toBe(false);
    expect(result.revisedSteps).toEqual([step2]);
  });
});

// ── MemoryUpdater ────────────────────────────────────────────────────────────

describe('MemoryUpdater', () => {
  it('writes facts and project md line', async () => {
    const llm = vi.fn().mockResolvedValue(
      JSON.stringify({ facts: ['Used LanceDB for vectors'], projectMdLine: 'Switched to LanceDB' }),
    );
    const remember = vi.fn().mockResolvedValue(undefined);
    const appendToProjectMd = vi.fn().mockResolvedValue(undefined);
    const updater = new MemoryUpdater(llm);
    const result = await updater.update({
      taskId: 'task-1',
      originalTask: 'swap vector store',
      stepResults: [{ step: 1, output: 'done', durationMs: 100, success: true }],
      remember,
      appendToProjectMd,
    });
    expect(result.factsWritten).toBe(1);
    expect(result.projectMdUpdated).toBe(true);
    expect(remember).toHaveBeenCalledWith('Used LanceDB for vectors', ['task:task-1']);
    expect(appendToProjectMd).toHaveBeenCalledWith('- Switched to LanceDB');
  });

  it('skips update when all steps failed', async () => {
    const llm = vi.fn();
    const updater = new MemoryUpdater(llm);
    const result = await updater.update({
      taskId: 'task-2',
      originalTask: 'broken task',
      stepResults: [{ step: 1, output: '', durationMs: 0, success: false, error: 'timeout' }],
      remember: vi.fn(),
      appendToProjectMd: vi.fn(),
    });
    expect(result.factsWritten).toBe(0);
    expect(llm).not.toHaveBeenCalled();
  });

  it('handles null projectMdLine', async () => {
    const llm = vi.fn().mockResolvedValue(
      JSON.stringify({ facts: ['a fact'], projectMdLine: null }),
    );
    const appendToProjectMd = vi.fn();
    const updater = new MemoryUpdater(llm);
    await updater.update({
      taskId: 'task-3',
      originalTask: 'minor tweak',
      stepResults: [{ step: 1, output: 'ok', durationMs: 50, success: true }],
      remember: vi.fn().mockResolvedValue(undefined),
      appendToProjectMd,
    });
    expect(appendToProjectMd).not.toHaveBeenCalled();
  });
});
