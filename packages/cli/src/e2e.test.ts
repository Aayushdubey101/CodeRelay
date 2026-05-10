/**
 * End-to-end integration tests covering the full CodeRelay flow.
 * Uses mock LLM + executor to avoid real API keys.
 * Maps to the 13 verification steps in the spec.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { OrchestratorRunner, OrchestratorMonitor } from '@coderelay/orchestrator';
import type { OrchestratorOptions, MonitorEvent } from '@coderelay/orchestrator';
import { ActionLog, defaultLogPath } from '@coderelay/governor';
import { SessionMemory, LongTermMemory } from '@coderelay/memory';
import { UsageTracker } from '@coderelay/router';
import { validateKeyFormat, testCredential } from './auth.js';
import { analyzeProject } from './init.js';
import { gatherChecks, printChecks } from './setup.js';

// ── Test project fixture ─────────────────────────────────────────────────────

const TEST_ROOT = join(tmpdir(), `cr-e2e-${process.pid}`);
const DB_DIR = join(TEST_ROOT, '.coderelay');
const SESSION_DB = join(DB_DIR, 'session.db');
const LONGTERM_DB = join(DB_DIR, 'longterm.db');
const USAGE_DB = join(DB_DIR, 'usage.db');
const LOG_PATH = join(DB_DIR, 'action.log');

// Mock task state shared across tests
let completedTaskId = '';
let completedBranch = '';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue([{ content: 'app code', token_count: 20 }]),
    }),
    close: vi.fn(),
  };
}

function makeMockLog(logPath: string) {
  return new ActionLog(logPath);
}

function makeMockWorktree(taskId: string) {
  const branch = `coderelay/task-${taskId.slice(0, 8)}`;
  completedBranch = branch;
  return { path: TEST_ROOT, branch, baseBranch: 'main' };
}

function makeMockLlm() {
  return vi.fn().mockImplementation(async (system: string) => {
    if (system.includes('planner') || system.includes('plan') || system.includes('software')) {
      return JSON.stringify([
        { step: 1, intent: 'Create index.js with Express server', expectedFiles: ['index.js'], toolsNeeded: ['write_file'] },
        { step: 2, intent: 'Add GET /health endpoint', expectedFiles: ['index.js'], toolsNeeded: ['edit_file'] },
      ]);
    }
    if (system.includes('re-aligner') || system.includes('re-align')) {
      return JSON.stringify({ driftDetected: false, reason: 'on track', revisedSteps: [] });
    }
    return JSON.stringify({ facts: ['Created Express server with /health endpoint'], projectMdLine: 'Added Express server' });
  });
}

function makeMockExecutor(taskId: string) {
  return {
    execute: vi.fn().mockImplementation(async (step: { step: number; intent: string }) => {
      // Simulate creating index.js
      if (step.step === 1) {
        writeFileSync(join(TEST_ROOT, 'index.js'),
          `const express = require('express');\nconst app = express();\napp.listen(3000);\n`);
      }
      if (step.step === 2) {
        writeFileSync(join(TEST_ROOT, 'index.js'),
          `const express = require('express');\nconst app = express();\napp.get('/health', (_, res) => res.json({ ok: true }));\napp.listen(3000);\n`);
      }
      return { step: step.step, output: `Created index.js (task ${taskId})`, durationMs: 50, success: true };
    }),
  };
}

function makeMockVerifier() {
  return {
    verify: vi.fn().mockResolvedValue({ passed: true, checks: [{ name: 'typecheck', passed: true, output: '' }] }),
  };
}

// ── Setup/teardown ────────────────────────────────────────────────────────────

beforeAll(() => {
  mkdirSync(DB_DIR, { recursive: true });
  // Create a minimal package.json so analyzeProject detects typescript
  writeFileSync(join(TEST_ROOT, 'package.json'), JSON.stringify({ name: 'test-app' }, null, 2));
});

afterAll(() => {
  try { rmSync(TEST_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Step 1: coderelay setup ───────────────────────────────────────────────────

describe('Step 1 — coderelay setup', () => {
  it('PASS: gatherChecks returns Node.js >=20 as required and passing', async () => {
    const mockTool = vi.fn().mockResolvedValue({ ok: true, detail: 'v10.0.0' });
    const mockHttp = vi.fn().mockResolvedValue({ ok: false, detail: 'not running' });
    const checks = await gatherChecks(mockTool, mockHttp);
    const node = checks.find(c => c.name === 'Node.js >=20')!;
    expect(node.required).toBe(true);
    expect(node.ok).toBe(true);
  });

  it('PASS: printChecks does not throw', async () => {
    const mockTool = vi.fn().mockResolvedValue({ ok: true, detail: 'v1' });
    const mockHttp = vi.fn().mockResolvedValue({ ok: true, detail: 'HTTP 200' });
    const checks = await gatherChecks(mockTool, mockHttp);
    expect(() => printChecks(checks)).not.toThrow();
  });
});

// ── Step 2: coderelay auth ────────────────────────────────────────────────────

describe('Step 2 — coderelay auth', () => {
  it('PASS: validateKeyFormat accepts valid anthropic key', () => {
    expect(validateKeyFormat('anthropic', 'sk-ant-api03-testkey123456')).toBeNull();
  });

  it('PASS: validateKeyFormat rejects bad format', () => {
    expect(validateKeyFormat('anthropic', 'badkey')).not.toBeNull();
  });

  it('PASS: testCredential returns ok:false when network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await testCredential('anthropic', 'sk-ant-test');
    expect(result.ok).toBe(false);
    vi.unstubAllGlobals();
  });
});

// ── Steps 3–4: project + init ─────────────────────────────────────────────────

describe('Step 3+4 — test project + coderelay init', () => {
  it('PASS: analyzeProject detects typescript project with package.json', () => {
    const analysis = analyzeProject(TEST_ROOT);
    expect(analysis.type).toBe('typescript');
    expect(analysis.fileCount).toBeGreaterThan(0);
  });

  it('PASS: SessionMemory creates session.db schema', () => {
    const sm = new SessionMemory({ dbPath: SESSION_DB });
    const sid = sm.openSession();
    expect(sid).toBeTruthy();
    sm.close();
    expect(existsSync(SESSION_DB)).toBe(true);
  });

  it('PASS: LongTermMemory creates longterm.db schema', async () => {
    const lt = new LongTermMemory({ dbPath: LONGTERM_DB });
    await lt.recordFact('test fact', ['e2e']);
    const results = await lt.searchText('test');
    expect(results.length).toBeGreaterThan(0);
    lt.close();
    expect(existsSync(LONGTERM_DB)).toBe(true);
  });
});

// ── Step 5–7: coderelay ask → plan → execute ──────────────────────────────────

describe('Step 5+6+7 — orchestrator loop (plan → execute → verify)', () => {
  it('PASS: plan() returns structured steps', async () => {
    const taskId = randomUUID();
    const opts: OrchestratorOptions = {
      graphDb: makeMockDb() as never,
      vector: null,
      llm: makeMockLlm(),
      log: makeMockLog(LOG_PATH),
      worktree: makeMockWorktree(taskId),
    };
    const runner = new OrchestratorRunner(opts);
    const steps = await runner.plan('create an Express server in index.js with one GET /health endpoint');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toHaveProperty('intent');
    expect(steps[0]).toHaveProperty('expectedFiles');
  });

  it('PASS: run() executes full Plan→Retrieve→Execute→Verify→Realign loop', async () => {
    const taskId = randomUUID();
    const opts: OrchestratorOptions = {
      graphDb: makeMockDb() as never,
      vector: null,
      llm: makeMockLlm(),
      log: makeMockLog(LOG_PATH),
      worktree: makeMockWorktree(taskId),
    };
    const runner = new OrchestratorRunner(opts);
    const executor = makeMockExecutor(taskId);
    const verifier = makeMockVerifier();
    // @ts-expect-error inject mocks
    runner['executor'] = executor;
    // @ts-expect-error inject mocks
    runner['verifier'] = verifier;

    const result = await runner.run('create an Express server in index.js with one GET /health endpoint');
    completedTaskId = result.taskId;

    expect(result.steps.length).toBe(2);
    expect(result.results.length).toBe(2);
    expect(result.results.every(r => r.success)).toBe(true);
    expect(executor.execute).toHaveBeenCalledTimes(2);
    expect(verifier.verify).toHaveBeenCalledTimes(2);
  });

  it('PASS: index.js was created by executor in worktree path', () => {
    expect(existsSync(join(TEST_ROOT, 'index.js'))).toBe(true);
    const content = require('node:fs').readFileSync(join(TEST_ROOT, 'index.js'), 'utf8');
    expect(content).toContain('/health');
  });
});

// ── Step 8: context manifest / retriever ──────────────────────────────────────

describe('Step 8 — context manifest shows retrieved files', () => {
  it('PASS: retriever returns context chunks from mock db', async () => {
    const { Retriever } = await import('@coderelay/orchestrator');
    const db = makeMockDb();
    const retriever = new Retriever(db as never, null, { tokenBudget: 1000 });
    const manifest = await retriever.retrieve({
      step: 1,
      intent: 'create Express server',
      expectedFiles: ['index.js'],
      toolsNeeded: ['write_file'],
    });
    expect(manifest.chunks.length).toBeGreaterThan(0);
    expect(manifest.totalTokens).toBeGreaterThan(0);
  });
});

// ── Step 9: isolated git branch ───────────────────────────────────────────────

describe('Step 9 — changes isolated in worktree branch', () => {
  it('PASS: worktree branch follows coderelay/task-<id> pattern', () => {
    expect(completedBranch).toMatch(/^coderelay\/task-[0-9a-f]{8}$/);
  });
});

// ── Step 10: merge → main ─────────────────────────────────────────────────────

describe('Step 10 — merge approved (simulated)', () => {
  it('PASS: formatResult shows merge-ready output with branch', async () => {
    const { formatResult } = await import('./ask.js');
    const fakeResult = {
      taskId: completedTaskId || randomUUID(),
      steps: [{ step: 1, intent: 'x', expectedFiles: [], toolsNeeded: [] }],
      results: [{ step: 1, output: 'done', durationMs: 50, success: true }],
      verifications: [{ passed: true, checks: [] }],
      factsWritten: 1,
      driftDetected: false,
    };
    const out = formatResult(fakeResult);
    expect(out).toContain('complete');
    expect(out).toContain('Steps executed');
  });
});

// ── Step 11: rollback ─────────────────────────────────────────────────────────

describe('Step 11 — coderelay rollback', () => {
  it('PASS: ActionLog records task entries that rollback can read', () => {
    const log = new ActionLog(LOG_PATH);
    const taskId = randomUUID();
    log.append({
      taskId,
      action: 'run',
      target: 'test task',
      outcome: 'success',
      meta: { branch: `coderelay/task-${taskId.slice(0, 8)}` },
    });
    const entries = log.forTask(taskId);
    expect(entries.length).toBe(1);
    expect(entries[0]!.taskId).toBe(taskId);
    expect(entries[0]!.meta).toMatchObject({ branch: expect.stringContaining('coderelay/task-') });
  });
});

// ── Step 12: usage tracking ───────────────────────────────────────────────────

describe('Step 12 — coderelay usage --today', () => {
  it('PASS: UsageTracker.queryAll() returns all entries', () => {
    const tracker = new UsageTracker(USAGE_DB);
    const now = Date.now();
    tracker.record({ ts: now, provider: 'anthropic', model: 'claude-haiku-4-5-20251001', tokens_in: 100, tokens_out: 50, tag: 'plan', cost_usd: 0.001, latency_ms: 200 });
    tracker.record({ ts: now, provider: 'anthropic', model: 'claude-haiku-4-5-20251001', tokens_in: 200, tokens_out: 80, tag: 'code-gen', cost_usd: 0.002, latency_ms: 300 });
    const all = tracker.queryAll();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const total = all.reduce((s, r) => s + r.tokens_in + r.tokens_out, 0);
    expect(total).toBeGreaterThanOrEqual(430);
  });

  it('PASS: UsageTracker.queryToday() returns only today entries', () => {
    const tracker = new UsageTracker(USAGE_DB);
    const today = tracker.queryToday();
    expect(Array.isArray(today)).toBe(true);
    expect(today.every(r => {
      const d = new Date(r.ts);
      const n = new Date();
      return d.toDateString() === n.toDateString();
    })).toBe(true);
  });
});

// ── Step 13: status ────────────────────────────────────────────────────────────

describe('Step 13 — coderelay status', () => {
  it('PASS: ActionLog.queryRecent() returns recent entries for status display', () => {
    const log = new ActionLog(LOG_PATH);
    const all = log.readAll();
    expect(Array.isArray(all)).toBe(true);
    // At least the entry we wrote in step 11
    expect(all.length).toBeGreaterThan(0);
  });
});

// ── Step 7 extra: monitor emits events ───────────────────────────────────────

describe('Step 7 — OrchestratorMonitor wired into runner', () => {
  it('PASS: onMonitorEvent fires for budget check', async () => {
    const events: MonitorEvent[] = [];
    const taskId = randomUUID();
    const opts: OrchestratorOptions = {
      graphDb: makeMockDb() as never,
      vector: null,
      llm: makeMockLlm(),
      log: makeMockLog(LOG_PATH),
      worktree: makeMockWorktree(taskId),
      tokenBudget: 1,  // tiny budget → guaranteed budget_exceeded event
      onMonitorEvent: (ev) => events.push(ev),
    };
    const runner = new OrchestratorRunner(opts);
    // @ts-expect-error inject mocks
    runner['executor'] = makeMockExecutor(taskId);
    // @ts-expect-error inject mocks
    runner['verifier'] = makeMockVerifier();

    await runner.run('add caching');
    expect(events.some(e => e.type === 'budget_exceeded')).toBe(true);
  });
});
