import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export interface SolidViolation {
  principle: 'SRP' | 'OCP' | 'LSP' | 'ISP' | 'DIP';
  file: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export interface SolidResult {
  violations: SolidViolation[];
  score: number; // 0-100, higher is better
}

export function checkSolid(dir: string): SolidResult {
  const files: string[] = [];
  walkDir(dir, ['.ts', '.js', '.tsx', '.jsx'], files);

  const violations: SolidViolation[] = [];

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    violations.push(...checkSrp(file, src));
    violations.push(...checkOcp(file, src));
    violations.push(...checkIsp(file, src));
    violations.push(...checkDip(file, src));
  }

  const score = Math.max(0, 100 - violations.length * 5);
  return { violations, score };
}

function checkSrp(file: string, src: string): SolidViolation[] {
  const violations: SolidViolation[] = [];
  const lines = src.split('\n').length;
  const publicMethods = (src.match(/\bpublic\s+\w+\s*\(/g) ?? []).length;
  const exportedFns = (src.match(/^export\s+(?:async\s+)?function\s+/gm) ?? []).length;

  if (lines > 400 && (publicMethods + exportedFns) > 10) {
    violations.push({
      principle: 'SRP',
      file,
      description: `Large file (${lines} lines, ${publicMethods + exportedFns} exports) likely has multiple responsibilities`,
      severity: 'medium',
    });
  }
  return violations;
}

function checkOcp(file: string, src: string): SolidViolation[] {
  const violations: SolidViolation[] = [];
  // Look for switch statements on type fields — common OCP violation
  const switchOnType = src.match(/switch\s*\(\s*\w+\.(?:type|kind|variant)\s*\)/g);
  if (switchOnType && switchOnType.length > 2) {
    violations.push({
      principle: 'OCP',
      file,
      description: `${switchOnType.length} switch-on-type patterns — consider polymorphism or strategy map`,
      severity: 'low',
    });
  }
  return violations;
}

function checkIsp(file: string, src: string): SolidViolation[] {
  const violations: SolidViolation[] = [];
  // Interfaces with many methods are a smell
  const interfaceBlocks = src.match(/interface\s+\w+\s*\{[^}]+\}/g) ?? [];
  for (const block of interfaceBlocks) {
    const methods = (block.match(/\w+\s*[(<:]/g) ?? []).length;
    if (methods > 8) {
      const name = block.match(/interface\s+(\w+)/)?.[1] ?? 'unknown';
      violations.push({
        principle: 'ISP',
        file,
        description: `Interface ${name} has ${methods} members — split into narrower interfaces`,
        severity: 'medium',
      });
    }
  }
  return violations;
}

function checkDip(file: string, src: string): SolidViolation[] {
  const violations: SolidViolation[] = [];
  // Direct instantiation of concrete classes in constructors = DIP violation
  const newInCtor = src.match(/constructor[^{]*\{[^}]*new\s+[A-Z]\w+\s*\(/g);
  if (newInCtor && newInCtor.length > 0) {
    violations.push({
      principle: 'DIP',
      file,
      description: `Constructor directly instantiates ${newInCtor.length} concrete class(es) — inject dependencies instead`,
      severity: 'high',
    });
  }
  return violations;
}

function walkDir(dir: string, exts: string[], acc: string[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walkDir(full, exts, acc);
    else if (exts.includes(extname(full))) acc.push(full);
  }
}
