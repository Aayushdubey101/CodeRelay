import { describe, it, expect } from 'vitest';
import { analyzeFile, analyzeDir } from './complexity.js';
import { detectDuplication } from './duplication.js';
import { checkSolid } from './solid.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = join(tmpdir(), 'cr-quality-test-' + Date.now());
mkdirSync(TMP, { recursive: true });

function setup(name: string, content: string): string {
  const p = join(TMP, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

describe('complexity', () => {
  it('detects low complexity for simple function', () => {
    const file = setup('simple.ts', `
function hello(name: string) {
  return 'hello ' + name;
}
`);
    const result = analyzeFile(file);
    expect(result.maxComplexity).toBeLessThan(5);
  });

  it('detects higher complexity with branches', () => {
    const file = setup('complex.ts', `
function classify(x: number) {
  if (x > 100) {
    if (x > 200) return 'huge';
    else return 'big';
  } else if (x > 50) {
    return 'medium';
  } else if (x > 10) {
    return 'small';
  } else {
    return 'tiny';
  }
}
`);
    const result = analyzeFile(file);
    expect(result.maxComplexity).toBeGreaterThan(3);
  });

  it('returns file path in result', () => {
    const file = setup('pathed.ts', 'const x = 1;');
    const result = analyzeFile(file);
    expect(result.file).toBe(file);
  });
});

describe('duplication', () => {
  it('finds no duplicates in unique code', () => {
    const subdir = join(TMP, 'unique');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'a.ts'), Array.from({ length: 20 }, (_, i) => `const x${i} = ${i};`).join('\n'));
    writeFileSync(join(subdir, 'b.ts'), Array.from({ length: 20 }, (_, i) => `const y${i} = ${i * 2};`).join('\n'));
    const result = detectDuplication(subdir);
    expect(result).toHaveProperty('duplicates');
    expect(result).toHaveProperty('duplicateLineRate');
  });

  it('detects duplicates in identical blocks', () => {
    const subdir = join(TMP, 'dup');
    mkdirSync(subdir, { recursive: true });
    const block = Array.from({ length: 10 }, (_, i) => `const val${i} = compute(${i});`).join('\n');
    writeFileSync(join(subdir, 'dup1.ts'), block);
    writeFileSync(join(subdir, 'dup2.ts'), block);
    const result = detectDuplication(subdir);
    expect(result.duplicates.length).toBeGreaterThan(0);
  });
});

describe('solid', () => {
  it('no DIP violation when injecting dependencies', () => {
    const subdir = join(TMP, 'clean');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'service.ts'), `
export class UserService {
  constructor(private readonly repo: UserRepo) {}
  async getUser(id: string) { return this.repo.findById(id); }
}
`);
    const result = checkSolid(subdir);
    const dipViolations = result.violations.filter(v => v.principle === 'DIP');
    expect(dipViolations).toHaveLength(0);
  });

  it('flags DIP violation for new in constructor', () => {
    const subdir = join(TMP, 'bad');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'bad.ts'), `
class Controller {
  private svc: UserService;
  constructor() {
    this.svc = new UserService();
  }
}
`);
    const result = checkSolid(subdir);
    const dipViolations = result.violations.filter(v => v.principle === 'DIP');
    expect(dipViolations.length).toBeGreaterThan(0);
  });

  it('returns a score 0-100', () => {
    const subdir = join(TMP, 'score');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'empty.ts'), 'export const x = 1;');
    const result = checkSolid(subdir);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
