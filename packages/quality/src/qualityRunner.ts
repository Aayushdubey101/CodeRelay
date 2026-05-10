import { analyzeDir } from './complexity.js';
import { detectDuplication } from './duplication.js';
import { checkSolid } from './solid.js';
import type { ComplexityResult } from './complexity.js';
import type { DuplicationResult } from './duplication.js';
import type { SolidResult } from './solid.js';

export interface QualityResult {
  path: string;
  complexity: ComplexityResult[];
  duplication: DuplicationResult;
  solid: SolidResult;
  passed: boolean;
}

export interface QualityThresholds {
  maxComplexity?: number;
  maxDuplicateRate?: number;
  minSolidScore?: number;
}

const DEFAULTS: Required<QualityThresholds> = {
  maxComplexity: 15,
  maxDuplicateRate: 0.15,
  minSolidScore: 60,
};

export async function runQuality(path: string, thresholds: QualityThresholds = {}): Promise<QualityResult> {
  const t = { ...DEFAULTS, ...thresholds };

  const complexity = analyzeDir(path);
  const duplication = detectDuplication(path);
  const solid = checkSolid(path);

  const maxCC = complexity.reduce((m, r) => Math.max(m, r.maxComplexity), 0);
  const passed =
    maxCC <= t.maxComplexity &&
    duplication.duplicateLineRate <= t.maxDuplicateRate &&
    solid.score >= t.minSolidScore;

  return { path, complexity, duplication, solid, passed };
}
