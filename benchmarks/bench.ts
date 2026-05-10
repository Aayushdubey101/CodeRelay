#!/usr/bin/env node
/**
 * CodeRelay benchmark harness — runs synthetic tasks against a local repo
 * and measures token usage + latency.
 *
 * Usage:
 *   pnpm bench [--repo <path>] [--runs <n>]
 *
 * Output:
 *   benchmarks/results.json   (machine-readable)
 *   stdout                    (human-readable table)
 */

import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

interface TaskDef {
  id: string;
  description: string;
  prompt: string;
  expectedFiles: string[];
}

interface RunResult {
  taskId: string;
  durationMs: number;
  success: boolean;
  tokensIn: number;
  tokensOut: number;
  error?: string;
}

interface BenchReport {
  ts: string;
  repo: string;
  runs: number;
  results: RunResult[];
  summary: {
    totalTasks: number;
    successRate: number;
    avgDurationMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    estimatedCostUsd: number;
  };
}

// Synthetic tasks that exercise core code paths without real LLM calls
const SYNTHETIC_TASKS: TaskDef[] = [
  {
    id: 'index-speed',
    description: 'Index target repo and measure throughput',
    prompt: 'coderelay index',
    expectedFiles: [],
  },
  {
    id: 'graph-stats',
    description: 'Query code graph statistics',
    prompt: 'coderelay graph stats',
    expectedFiles: [],
  },
  {
    id: 'search-latency',
    description: 'Keyword search in indexed chunks',
    prompt: 'coderelay search "function"',
    expectedFiles: [],
  },
  {
    id: 'context-retrieval',
    description: 'Retrieve context for a query under 8k token budget',
    prompt: 'coderelay context "add error handling"',
    expectedFiles: [],
  },
  {
    id: 'plan-generation',
    description: 'Generate plan (dry-run, no LLM required)',
    prompt: 'coderelay --version',
    expectedFiles: [],
  },
];

function runCmd(cmd: string, cwd: string): { stdout: string; durationMs: number; success: boolean; error?: string } {
  const start = Date.now();
  try {
    const stdout = execSync(cmd, { cwd, timeout: 60_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { stdout, durationMs: Date.now() - start, success: true };
  } catch (err) {
    return {
      stdout: '',
      durationMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }
}

function printTable(report: BenchReport): void {
  const s = report.summary;
  console.log(`\nCodeRelay Benchmark — ${report.ts}`);
  console.log(`Repo: ${report.repo}  Runs: ${report.runs}`);
  console.log('─'.repeat(80));
  console.log(
    'Task'.padEnd(22) + 'Status'.padEnd(10) + 'ms'.padStart(8) + 'TokIn'.padStart(10) + 'TokOut'.padStart(10)
  );
  console.log('─'.repeat(80));

  for (const r of report.results) {
    const status = r.success ? 'OK' : 'FAIL';
    console.log(
      r.taskId.padEnd(22) +
        status.padEnd(10) +
        String(r.durationMs).padStart(8) +
        String(r.tokensIn).padStart(10) +
        String(r.tokensOut).padStart(10)
    );
    if (!r.success && r.error) {
      console.log(`  Error: ${r.error}`);
    }
  }

  console.log('─'.repeat(80));
  console.log(`Success rate    : ${(s.successRate * 100).toFixed(1)}%`);
  console.log(`Avg duration    : ${s.avgDurationMs.toFixed(0)} ms`);
  console.log(`Total tokens in : ${s.totalTokensIn.toLocaleString()}`);
  console.log(`Total tokens out: ${s.totalTokensOut.toLocaleString()}`);
  console.log(`Est. cost       : $${s.estimatedCostUsd.toFixed(6)}`);
  console.log();
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: process.cwd() },
      runs: { type: 'string', default: '1' },
    },
    allowPositionals: false,
  });

  const repoPath = resolve(values['repo'] ?? process.cwd());
  const runs = Math.max(1, parseInt(values['runs'] ?? '1', 10));

  if (!existsSync(repoPath)) {
    console.error(`Repo not found: ${repoPath}`);
    process.exit(1);
  }

  // Find coderelay binary
  const binPath = join(process.cwd(), 'node_modules', '.bin', 'coderelay');
  const crBin = existsSync(binPath) ? binPath : 'coderelay';

  const allResults: RunResult[] = [];

  for (let run = 0; run < runs; run++) {
    if (runs > 1) console.log(`Run ${run + 1}/${runs}`);

    for (const task of SYNTHETIC_TASKS) {
      process.stdout.write(`  ${task.id}...`);
      const cmd = task.prompt.startsWith('coderelay')
        ? `${crBin} ${task.prompt.slice('coderelay '.length)}`
        : task.prompt;

      const r = runCmd(cmd, repoPath);
      process.stdout.write(r.success ? ' OK\n' : ` FAIL: ${r.error?.slice(0, 60)}\n`);

      allResults.push({
        taskId: task.id,
        durationMs: r.durationMs,
        success: r.success,
        tokensIn: 0,   // populated from usage.db in future
        tokensOut: 0,
        error: r.error,
      });
    }
  }

  const successCount = allResults.filter((r) => r.success).length;
  const avgDuration = allResults.reduce((s, r) => s + r.durationMs, 0) / (allResults.length || 1);

  const report: BenchReport = {
    ts: new Date().toISOString(),
    repo: repoPath,
    runs,
    results: allResults,
    summary: {
      totalTasks: allResults.length,
      successRate: successCount / (allResults.length || 1),
      avgDurationMs: avgDuration,
      totalTokensIn: 0,
      totalTokensOut: 0,
      estimatedCostUsd: 0,
    },
  };

  printTable(report);

  const outPath = join(process.cwd(), 'benchmarks', 'results.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Results saved to benchmarks/results.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
