import { randomUUID } from 'node:crypto';
import { Planner, type LlmCaller, type PlanStep } from './planner.js';
import { Retriever, type GraphDbLike, type VectorStoreLike } from './retriever.js';
import { Executor } from './executor.js';
import { Verifier } from './verifier.js';
import { Realigner } from './realigner.js';
import { MemoryUpdater } from './memoryUpdate.js';
import { OrchestratorMonitor, type MonitorEvent } from './monitor.js';
import type { ActionLog, WorktreeInfo } from '@coderelay/governor';
import type { AgentName } from '@coderelay/sub-agents';
import type { ExecutorResult } from './executor.js';
import type { VerifierResult } from './verifier.js';

export type ProgressStatus = 'running' | 'done' | 'failed';

export interface OrchestratorProgressEvent {
  stepNum: number;
  totalSteps: number;
  intent: string;
  status: ProgressStatus;
  tokensUsed?: number;
}

export interface OrchestratorOptions {
  graphDb: GraphDbLike;
  vector?: VectorStoreLike | null;
  llm: LlmCaller;
  log: ActionLog;
  worktree: WorktreeInfo;
  retrieverBudget?: number;
  mcpServerBinPath?: string;
  agentName?: AgentName;
  timeoutMs?: number;
  repoSummary?: string;
  remember?: (text: string, tags?: string[]) => Promise<void>;
  appendToProjectMd?: (line: string) => Promise<void>;
  onProgress?: (event: OrchestratorProgressEvent) => void;
  onMonitorEvent?: (event: MonitorEvent) => void;
  tokenBudget?: number;
}

export interface OrchestratorRunResult {
  taskId: string;
  steps: PlanStep[];
  results: ExecutorResult[];
  verifications: VerifierResult[];
  factsWritten: number;
  driftDetected: boolean;
}

export class OrchestratorRunner {
  private readonly planner: Planner;
  private readonly retriever: Retriever;
  private readonly executor: Executor;
  private readonly verifier: Verifier;
  private readonly realigner: Realigner;
  private readonly memoryUpdater: MemoryUpdater;
  private readonly monitor: OrchestratorMonitor;

  constructor(private readonly opts: OrchestratorOptions) {
    this.planner = new Planner(opts.llm);
    this.retriever = new Retriever(opts.graphDb, opts.vector ?? null, {
      tokenBudget: opts.retrieverBudget ?? 8000,
    });
    this.executor = new Executor(opts.log, {
      agent: opts.agentName ?? 'claude',
      ...(opts.mcpServerBinPath !== undefined ? { mcpServerBinPath: opts.mcpServerBinPath } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    });
    this.verifier = new Verifier();
    this.realigner = new Realigner(opts.llm);
    this.memoryUpdater = new MemoryUpdater(opts.llm);
    this.monitor = new OrchestratorMonitor();
  }

  async plan(task: string): Promise<PlanStep[]> {
    const repoSummary = this.opts.repoSummary ?? '';
    const { steps } = await this.planner.plan({ task, repoSummary });
    return steps;
  }

  async run(task: string): Promise<OrchestratorRunResult> {
    const taskId = randomUUID();
    const repoSummary = this.opts.repoSummary ?? '';
    const tokenBudget = this.opts.tokenBudget ?? 100_000;
    let tokensUsed = 0;

    const { steps: initialSteps } = await this.planner.plan({ task, repoSummary });

    const allResults: ExecutorResult[] = [];
    const allVerifications: VerifierResult[] = [];
    const completedSteps: PlanStep[] = [];
    const stepOutcomes: string[] = [];
    let remainingSteps = [...initialSteps];
    let anyDrift = false;

    for (let i = 0; i < remainingSteps.length; i++) {
      const step = remainingSteps[i]!;

      this.opts.onProgress?.({
        stepNum: step.step,
        totalSteps: remainingSteps.length,
        intent: step.intent,
        status: 'running',
      });

      const manifest = await this.retriever.retrieve(step);

      const result = await this.executor.execute(step, manifest, this.opts.worktree);
      allResults.push(result);

      // Approximate token usage from output length (4 chars ≈ 1 token)
      tokensUsed += Math.ceil(result.output.length / 4);

      const verification = await this.verifier.verify(step, { cwd: this.opts.worktree.path });
      allVerifications.push(verification);

      this.opts.onProgress?.({
        stepNum: step.step,
        totalSteps: remainingSteps.length,
        intent: step.intent,
        status: result.success ? 'done' : 'failed',
        tokensUsed,
      });

      // Monitor checks
      if (this.opts.onMonitorEvent) {
        const changedFiles = result.output.match(/[^\s]+\.[a-zA-Z]{1,6}/g) ?? [];
        const events = this.monitor.checkAll({
          budget: { used: tokensUsed, total: tokenBudget },
          expectedFiles: step.expectedFiles,
          changedFiles,
          step: step.step,
        });
        for (const ev of events) this.opts.onMonitorEvent(ev);
      }

      completedSteps.push(step);
      stepOutcomes.push(result.success ? result.output.slice(0, 200) : `FAILED: ${result.error ?? 'unknown'}`);

      const upcoming = remainingSteps.slice(i + 1);
      if (upcoming.length > 0) {
        const realignment = await this.realigner.realign({
          originalTask: task,
          completedSteps,
          remainingSteps: upcoming,
          stepOutcomes,
        });
        if (realignment.driftDetected) {
          anyDrift = true;
          remainingSteps = [...completedSteps, ...realignment.revisedSteps];
        }
      }
    }

    const remember = this.opts.remember ?? (async (_text: string, _tags?: string[]) => { /* no-op */ });
    const appendToProjectMd = this.opts.appendToProjectMd ?? (async (_line: string) => { /* no-op */ });

    const memResult = await this.memoryUpdater.update({
      taskId,
      originalTask: task,
      stepResults: allResults,
      remember,
      appendToProjectMd,
    });

    return {
      taskId,
      steps: completedSteps,
      results: allResults,
      verifications: allVerifications,
      factsWritten: memResult.factsWritten,
      driftDetected: anyDrift,
    };
  }
}
