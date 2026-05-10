import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export interface ComplexityResult {
  file: string;
  functions: FunctionComplexity[];
  maxComplexity: number;
  avgComplexity: number;
}

export interface FunctionComplexity {
  name: string;
  complexity: number;
  line: number;
}

const BRANCH_PATTERNS = [
  /\bif\s*\(/g,
  /\belse\s+if\s*\(/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bcase\s+/g,
  /\bcatch\s*\(/g,
  /\?\s*[^:]/g,           // ternary
  /&&|\|\|/g,             // logical operators
];

export function analyzeFile(filePath: string): ComplexityResult {
  const src = readFileSync(filePath, 'utf8');
  const functions = extractFunctions(src);

  const maxComplexity = functions.reduce((m, f) => Math.max(m, f.complexity), 1);
  const avgComplexity = functions.length
    ? functions.reduce((s, f) => s + f.complexity, 0) / functions.length
    : 1;

  return { file: filePath, functions, maxComplexity, avgComplexity };
}

function extractFunctions(src: string): FunctionComplexity[] {
  const lines = src.split('\n');
  const results: FunctionComplexity[] = [];

  // Simple regex-based function detection (no AST to avoid dep)
  const fnPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>)/g;
  let m: RegExpExecArray | null;

  while ((m = fnPattern.exec(src)) !== null) {
    const name = m[1] ?? m[2] ?? '<anonymous>';
    const lineNum = src.slice(0, m.index).split('\n').length;
    const body = extractBody(src, m.index);
    const complexity = 1 + countBranches(body);
    results.push({ name, complexity, line: lineNum });
  }

  return results;
}

function extractBody(src: string, start: number): string {
  // Grab up to 150 lines after function start as rough body
  const slice = src.slice(start);
  const lines = slice.split('\n').slice(0, 150);
  return lines.join('\n');
}

function countBranches(body: string): number {
  let count = 0;
  for (const pattern of BRANCH_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    const matches = body.match(re);
    count += matches?.length ?? 0;
  }
  return count;
}

export function analyzeDir(dir: string, exts = ['.ts', '.js', '.tsx', '.jsx']): ComplexityResult[] {
  const results: ComplexityResult[] = [];
  walkDir(dir, exts, results);
  return results;
}

function walkDir(dir: string, exts: string[], acc: ComplexityResult[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkDir(full, exts, acc);
    } else if (exts.includes(extname(full))) {
      acc.push(analyzeFile(full));
    }
  }
}
