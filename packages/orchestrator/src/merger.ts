import type { ExecutorResult } from './executor.js';

export interface MergeConflict {
  file: string;
  stepA: number;
  stepB: number;
}

export interface MergeResult {
  results: ExecutorResult[];
  conflicts: MergeConflict[];
  successCount: number;
  failCount: number;
}

/** Merge results from multiple agents, detect file conflicts */
export function mergeResults(
  results: ExecutorResult[],
  agentAssignments: Map<number, string>,
): MergeResult {
  const fileToStep = new Map<string, number>();
  const conflicts: MergeConflict[] = [];

  // Parse modified files from output (heuristic: lines starting with "Edit " or "+ " in diff)
  for (const r of results) {
    if (!r.success) continue;
    const files = extractModifiedFiles(r.output);
    for (const file of files) {
      const prevStep = fileToStep.get(file);
      if (prevStep !== undefined && prevStep !== r.step) {
        conflicts.push({ file, stepA: prevStep, stepB: r.step });
      } else {
        fileToStep.set(file, r.step);
      }
    }
  }

  return {
    results,
    conflicts,
    successCount: results.filter(r => r.success).length,
    failCount: results.filter(r => !r.success).length,
  };
}

function extractModifiedFiles(output: string): string[] {
  const files = new Set<string>();
  const patterns = [
    /^(?:Edit|Write|Created?|Modified?):\s+(.+\.(?:ts|js|py|rs|go|java))/gm,
    /^\+\+\+\s+b\/(.+)/gm,
    /^diff --git a\/\S+ b\/(\S+)/gm,
  ];
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(output)) !== null) {
      files.add(m[1]!.trim());
    }
  }
  return [...files];
}
