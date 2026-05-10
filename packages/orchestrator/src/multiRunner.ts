import type { PlanStep } from './planner.js';
import type { RetrievalManifest } from './retriever.js';
import type { ExecutorResult } from './executor.js';
import { Executor } from './executor.js';
import type { ActionLog, WorktreeInfo } from '@coderelay/governor';
import { dispatchStep, groupByDependency, type DispatchPolicy } from './dispatcher.js';

export interface MultiRunnerOptions {
  policy: DispatchPolicy;
  log: ActionLog;
  worktree: WorktreeInfo;
  claudeAgent?: import('@coderelay/sub-agents').AgentName;
  geminiAgent?: import('@coderelay/sub-agents').AgentName;
  mcpServerBinPath?: string;
  timeoutMs?: number;
}

export interface MultiRunResult {
  results: ExecutorResult[];
  agentAssignments: Map<number, string>;
}

export class MultiRunner {
  private claudeExecutor: Executor;
  private geminiExecutor: Executor;

  constructor(private readonly opts: MultiRunnerOptions) {
    this.claudeExecutor = new Executor(opts.log, {
      agent: opts.claudeAgent ?? 'claude',
      ...(opts.mcpServerBinPath !== undefined ? { mcpServerBinPath: opts.mcpServerBinPath } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    });
    this.geminiExecutor = new Executor(opts.log, {
      agent: opts.geminiAgent ?? 'gemini',
      ...(opts.mcpServerBinPath !== undefined ? { mcpServerBinPath: opts.mcpServerBinPath } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    });
  }

  async run(steps: PlanStep[], manifests: Map<number, RetrievalManifest>): Promise<MultiRunResult> {
    const groups = groupByDependency(steps);
    const allResults: ExecutorResult[] = [];
    const agentAssignments = new Map<number, string>();
    const emptyManifest: RetrievalManifest = { step: 0, chunks: [], totalTokens: 0, budget: 8000 };

    for (const group of groups) {
      const groupResults = await Promise.all(
        group.map(async step => {
          const agent = dispatchStep(step, this.opts.policy);
          agentAssignments.set(step.step, agent);
          const executor = agent === 'gemini' ? this.geminiExecutor : this.claudeExecutor;
          const manifest = manifests.get(step.step) ?? emptyManifest;
          return executor.execute(step, manifest, this.opts.worktree);
        })
      );
      allResults.push(...groupResults);
    }

    return { results: allResults, agentAssignments };
  }
}
