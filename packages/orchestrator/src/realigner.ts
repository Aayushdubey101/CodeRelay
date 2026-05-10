import type { PlanStep, LlmCaller } from './planner.js';

export interface RealignerInput {
  originalTask: string;
  completedSteps: PlanStep[];
  remainingSteps: PlanStep[];
  /** Short summary of what each completed step actually did */
  stepOutcomes: string[];
}

export interface RealignerResult {
  driftDetected: boolean;
  revisedSteps: PlanStep[];
  reason: string;
}

const SYSTEM_PROMPT = `You are a software task re-aligner. Given an original user task, the steps already completed, and the remaining steps, decide if the remaining plan still aligns with the user's intent.

Output ONLY a JSON object (no markdown):
{
  "driftDetected": boolean,
  "reason": "one sentence explaining whether drift exists and why",
  "revisedSteps": [
    { "step": 1, "intent": "...", "expectedFiles": [...], "toolsNeeded": [...] },
    ...
  ]
}

If driftDetected is false, revisedSteps should be identical to the remaining steps.
If driftDetected is true, revisedSteps should be a corrected plan for the remaining work.`;

function buildUserMessage(input: RealignerInput): string {
  const completedSummary = input.completedSteps
    .map((s, i) => `  Step ${s.step}: ${s.intent}\n    Outcome: ${input.stepOutcomes[i] ?? 'completed'}`)
    .join('\n');

  const remainingSummary = input.remainingSteps
    .map((s) => `  Step ${s.step}: ${s.intent} (files: ${s.expectedFiles.join(', ') || 'unknown'})`)
    .join('\n');

  return `Original task: ${input.originalTask}

Completed steps:
${completedSummary || '  (none yet)'}

Remaining steps:
${remainingSummary || '  (none)'}

Does the remaining plan still align with the original task? If not, revise it.`;
}

export class Realigner {
  constructor(private readonly _llm: LlmCaller) {}

  async realign(input: RealignerInput): Promise<RealignerResult> {
    if (input.remainingSteps.length === 0) {
      return { driftDetected: false, revisedSteps: [], reason: 'No remaining steps.' };
    }

    const raw = await this._llm(SYSTEM_PROMPT, buildUserMessage(input));
    const trimmed = raw.trim();
    const json = trimmed.startsWith('```')
      ? trimmed.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '')
      : trimmed;

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      // LLM returned non-JSON — treat as no drift, keep original plan
      return {
        driftDetected: false,
        revisedSteps: input.remainingSteps,
        reason: `Re-aligner parse error (kept original plan): ${String(err)}`,
      };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { driftDetected: false, revisedSteps: input.remainingSteps, reason: 'Invalid response shape.' };
    }

    const r = parsed as Record<string, unknown>;
    const driftDetected = r['driftDetected'] === true;
    const reason = typeof r['reason'] === 'string' ? r['reason'] : '';
    const raw_steps = Array.isArray(r['revisedSteps']) ? (r['revisedSteps'] as unknown[]) : input.remainingSteps;

    const revisedSteps: PlanStep[] = (raw_steps as Record<string, unknown>[]).map((s, i) => ({
      step: typeof s['step'] === 'number' ? s['step'] : i + 1,
      intent: typeof s['intent'] === 'string' ? s['intent'] : '',
      expectedFiles: Array.isArray(s['expectedFiles']) ? (s['expectedFiles'] as string[]) : [],
      toolsNeeded: Array.isArray(s['toolsNeeded']) ? (s['toolsNeeded'] as string[]) : [],
    }));

    return { driftDetected, revisedSteps, reason };
  }
}
