import type { LlmCaller } from './planner.js';
import type { ExecutorResult } from './executor.js';

export interface MemoryUpdateInput {
  taskId: string;
  originalTask: string;
  stepResults: ExecutorResult[];
  /** Injected write function — satisfies LongTermMemory.remember signature */
  remember: (text: string, tags?: string[]) => Promise<void>;
  /** Injected append function — writes a line to PROJECT.md */
  appendToProjectMd: (line: string) => Promise<void>;
}

export interface MemoryUpdateResult {
  factsWritten: number;
  projectMdUpdated: boolean;
}

const SYSTEM_PROMPT = `You are a technical memory writer. Given a completed software task and its step outcomes, extract facts worth remembering across future sessions.

Output ONLY a JSON object (no markdown):
{
  "facts": [
    "short factual sentence about what was done or decided",
    ...
  ],
  "projectMdLine": "one-line summary for PROJECT.md, or null if nothing worth recording"
}

Facts should be: architectural decisions, patterns introduced, non-obvious constraints, or files that changed significantly.
Skip: trivial edits, obvious implementation details, anything already implied by the task name.`;

export class MemoryUpdater {
  constructor(private readonly _llm: LlmCaller) {}

  async update(input: MemoryUpdateInput): Promise<MemoryUpdateResult> {
    const successSteps = input.stepResults.filter((r) => r.success);
    if (successSteps.length === 0) {
      return { factsWritten: 0, projectMdUpdated: false };
    }

    const outcomesSummary = input.stepResults
      .map((r) => `Step ${r.step}: ${r.success ? 'OK' : 'FAILED'} (${r.durationMs}ms)${r.error ? ' — ' + r.error : ''}`)
      .join('\n');

    const userMsg = `Task: ${input.originalTask}\nTask ID: ${input.taskId}\n\nOutcomes:\n${outcomesSummary}`;
    const raw = await this._llm(SYSTEM_PROMPT, userMsg);

    const trimmed = raw.trim();
    const json = trimmed.startsWith('```')
      ? trimmed.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '')
      : trimmed;

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { factsWritten: 0, projectMdUpdated: false };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { factsWritten: 0, projectMdUpdated: false };
    }

    const p = parsed as Record<string, unknown>;
    const facts = Array.isArray(p['facts']) ? (p['facts'] as string[]).filter((f) => typeof f === 'string') : [];
    const projectMdLine = typeof p['projectMdLine'] === 'string' ? p['projectMdLine'] : null;

    const tags = ['task:' + input.taskId];
    for (const fact of facts) {
      await input.remember(fact, tags);
    }

    if (projectMdLine !== null && projectMdLine.trim().length > 0) {
      await input.appendToProjectMd(`- ${projectMdLine}`);
    }

    return { factsWritten: facts.length, projectMdUpdated: projectMdLine !== null };
  }
}
