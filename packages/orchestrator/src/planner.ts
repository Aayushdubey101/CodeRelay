export interface PlanStep {
  step: number;
  intent: string;
  expectedFiles: string[];
  toolsNeeded: string[];
}

export interface PlannerInput {
  task: string;
  repoSummary: string;
  maxSteps?: number;
}

export interface PlannerResult {
  steps: PlanStep[];
  rawResponse: string;
}

/** Injected LLM call — returns raw text that the planner parses. */
export type LlmCaller = (systemPrompt: string, userMessage: string) => Promise<string>;

const SYSTEM_PROMPT = `You are a software task planner. Given a user task and a repository summary, produce a structured JSON plan.

Output ONLY a JSON array (no markdown, no explanation) with this shape:
[
  {
    "step": 1,
    "intent": "short description of what this step does",
    "expectedFiles": ["src/path/to/file.ts", ...],
    "toolsNeeded": ["Read", "Edit", ...]
  },
  ...
]

Rules:
- Split tasks into 2–6 steps.
- Each step is atomic and achievable by a single sub-agent invocation.
- expectedFiles should be realistic paths based on the repo summary.
- toolsNeeded is a subset of: Read, Edit, Write, Bash, Grep, Glob.
- Respond with ONLY the JSON array.`;

function parseSteps(raw: string): PlanStep[] {
  const trimmed = raw.trim();
  // Strip markdown code fences if present
  const json = trimmed.startsWith('```')
    ? trimmed.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '')
    : trimmed;

  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('Plan response is not an array');

  return parsed.map((item: unknown, idx: number) => {
    if (typeof item !== 'object' || item === null) throw new Error(`Step ${idx} is not an object`);
    const s = item as Record<string, unknown>;
    return {
      step: typeof s['step'] === 'number' ? s['step'] : idx + 1,
      intent: typeof s['intent'] === 'string' ? s['intent'] : '',
      expectedFiles: Array.isArray(s['expectedFiles']) ? (s['expectedFiles'] as string[]) : [],
      toolsNeeded: Array.isArray(s['toolsNeeded']) ? (s['toolsNeeded'] as string[]) : [],
    };
  });
}

export class Planner {
  constructor(private readonly _llm: LlmCaller) {}

  async plan(input: PlannerInput): Promise<PlannerResult> {
    const maxSteps = input.maxSteps ?? 6;
    const userMessage =
      `Task: ${input.task}\n\nRepository summary:\n${input.repoSummary}\n\nProduce a plan with at most ${maxSteps} steps.`;

    const rawResponse = await this._llm(SYSTEM_PROMPT, userMessage);

    let steps: PlanStep[];
    try {
      steps = parseSteps(rawResponse);
    } catch (err) {
      throw new Error(`Planner: failed to parse LLM response — ${String(err)}\nRaw: ${rawResponse.slice(0, 200)}`);
    }

    // Enforce step numbering
    steps = steps.map((s, i) => ({ ...s, step: i + 1 }));

    return { steps, rawResponse };
  }
}
