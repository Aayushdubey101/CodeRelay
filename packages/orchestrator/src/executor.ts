import type { PlanStep } from './planner.js';
import type { RetrievalManifest } from './retriever.js';
import type { WorktreeInfo } from '@coderelay/governor';
import type { ActionLog } from '@coderelay/governor';
import { runAgent, type AgentName } from '@coderelay/sub-agents';

export interface ExecutorOptions {
  agent?: AgentName;
  mcpServerBinPath?: string;
  timeoutMs?: number;
}

export interface ExecutorResult {
  step: number;
  output: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

function buildPrompt(step: PlanStep, manifest: RetrievalManifest): string {
  const contextBlock = manifest.chunks
    .map((c) => `### ${c.filePath}\n\`\`\`\n${c.content}\n\`\`\``)
    .join('\n\n');

  return `## Task Step ${step.step}: ${step.intent}

### Relevant Context

${contextBlock || '(no context retrieved)'}

### Instructions

Complete step ${step.step}: ${step.intent}

Files you are likely to need: ${step.expectedFiles.join(', ') || '(see context above)'}
Tools available: ${step.toolsNeeded.join(', ') || 'Read, Edit, Bash'}

Make only the changes required for this step. Do not refactor unrelated code.`;
}

export class Executor {
  constructor(
    private readonly _log: ActionLog,
    private readonly _opts: ExecutorOptions = {},
  ) {}

  async execute(step: PlanStep, manifest: RetrievalManifest, worktree: WorktreeInfo): Promise<ExecutorResult> {
    const start = Date.now();
    const prompt = buildPrompt(step, manifest);
    const agent = this._opts.agent ?? 'claude';

    this._log.append({
      taskId: worktree.taskId,
      kind: 'agent_start',
      payload: { step: step.step, intent: step.intent, agent },
    });

    let output = '';
    let success = false;
    let error: string | undefined;

    try {
      const runOpts: Parameters<typeof runAgent>[0] = { agent, prompt, cwd: worktree.path };
      if (this._opts.mcpServerBinPath) runOpts.mcpServerBinPath = this._opts.mcpServerBinPath;
      if (this._opts.timeoutMs) runOpts.timeoutMs = this._opts.timeoutMs;
      output = await runAgent(runOpts);
      success = true;
    } catch (err) {
      error = String(err);
      output = '';
    }

    const durationMs = Date.now() - start;

    this._log.append({
      taskId: worktree.taskId,
      kind: 'agent_end',
      payload: { step: step.step, success, durationMs, error: error ?? null },
    });

    const result: ExecutorResult = { step: step.step, output, durationMs, success };
    if (error !== undefined) result.error = error;
    return result;
  }
}
