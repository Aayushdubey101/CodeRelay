import { z } from 'zod';
import type { PlanStep } from './planner.js';

export type AgentChoice = 'claude' | 'gemini' | 'auto';

export const DispatchPolicySchema = z.object({
  codeGen: z.enum(['claude', 'gemini', 'auto']).default('claude'),
  search: z.enum(['claude', 'gemini', 'auto']).default('gemini'),
  refactor: z.enum(['claude', 'gemini', 'auto']).default('claude'),
  default: z.enum(['claude', 'gemini', 'auto']).default('claude'),
});

export type DispatchPolicy = z.infer<typeof DispatchPolicySchema>;

const CODE_GEN_KEYWORDS = ['implement', 'write', 'create', 'add', 'generate', 'code'];
const SEARCH_KEYWORDS = ['find', 'search', 'locate', 'scan', 'grep', 'list'];
const REFACTOR_KEYWORDS = ['rename', 'refactor', 'move', 'extract', 'reorganize', 'restructure'];

export function dispatchStep(step: PlanStep, policy: DispatchPolicy): AgentChoice {
  const intent = step.intent.toLowerCase();

  const isCodeGen = CODE_GEN_KEYWORDS.some(k => intent.includes(k));
  const isSearch = SEARCH_KEYWORDS.some(k => intent.includes(k));
  const isRefactor = REFACTOR_KEYWORDS.some(k => intent.includes(k));

  if (isCodeGen) return resolveAuto(policy.codeGen, policy.default);
  if (isSearch) return resolveAuto(policy.search, policy.default);
  if (isRefactor) return resolveAuto(policy.refactor, policy.default);

  return resolveAuto(policy.default, 'claude');
}

function resolveAuto(choice: AgentChoice, fallback: AgentChoice): AgentChoice {
  return choice === 'auto' ? (fallback === 'auto' ? 'claude' : fallback) : choice;
}

export function groupByDependency(steps: PlanStep[]): PlanStep[][] {
  // Steps with no shared expectedFiles can run in parallel; sequential otherwise
  const groups: PlanStep[][] = [];
  const usedFiles = new Set<string>();

  for (const step of steps) {
    const conflicts = step.expectedFiles.some(f => usedFiles.has(f));
    if (conflicts || groups.length === 0) {
      groups.push([step]);
    } else {
      groups[groups.length - 1]!.push(step);
    }
    step.expectedFiles.forEach(f => usedFiles.add(f));
  }

  return groups;
}
