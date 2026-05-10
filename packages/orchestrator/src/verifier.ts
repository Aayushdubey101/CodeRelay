import { execa } from 'execa';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanStep } from './planner.js';

export interface VerifierResult {
  passed: boolean;
  checks: CheckResult[];
}

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
}

export interface VerifierOptions {
  /** Working directory to run checks in (usually the worktree path) */
  cwd: string;
}

async function runCheck(name: string, cmd: string, args: string[], cwd: string): Promise<CheckResult> {
  try {
    const r = await execa(cmd, args, { cwd, reject: false });
    const passed = r.exitCode === 0;
    return { name, passed, output: (r.stdout + r.stderr).trim().slice(0, 2000) };
  } catch (err) {
    return { name, passed: false, output: String(err) };
  }
}

async function detectTypeChecker(cwd: string): Promise<{ cmd: string; args: string[] } | null> {
  if (existsSync(join(cwd, 'tsconfig.json'))) return { cmd: 'npx', args: ['tsc', '--noEmit'] };
  if (existsSync(join(cwd, 'pyrightconfig.json'))) return { cmd: 'npx', args: ['pyright'] };
  if (existsSync(join(cwd, 'Cargo.toml'))) return { cmd: 'cargo', args: ['check'] };
  return null;
}

async function detectLinter(cwd: string): Promise<{ cmd: string; args: string[] } | null> {
  const pkg = join(cwd, 'package.json');
  if (existsSync(pkg)) {
    // Try ESLint if config exists
    const hasEslint = ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.js', '.eslintrc.json'].some((f) =>
      existsSync(join(cwd, f)),
    );
    if (hasEslint) return { cmd: 'npx', args: ['eslint', '--max-warnings=0', '.'] };
  }
  return null;
}

function checkAstDiff(step: PlanStep, changedFiles: string[]): CheckResult {
  if (step.expectedFiles.length === 0) {
    return { name: 'ast-diff', passed: true, output: 'No expected files specified — skipping.' };
  }

  const missing = step.expectedFiles.filter(
    (expected) => !changedFiles.some((changed) => changed.includes(expected) || expected.includes(changed)),
  );

  if (missing.length > 0) {
    return {
      name: 'ast-diff',
      passed: false,
      output: `Expected files not changed: ${missing.join(', ')}`,
    };
  }

  return { name: 'ast-diff', passed: true, output: `All expected files modified: ${step.expectedFiles.join(', ')}` };
}

async function getChangedFiles(cwd: string): Promise<string[]> {
  try {
    const r = await execa('git', ['diff', '--name-only', 'HEAD'], { cwd, reject: false });
    const staged = await execa('git', ['diff', '--name-only', '--cached'], { cwd, reject: false });
    const lines = [...r.stdout.split('\n'), ...staged.stdout.split('\n')]
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return [...new Set(lines)];
  } catch {
    return [];
  }
}

export class Verifier {
  async verify(step: PlanStep, opts: VerifierOptions): Promise<VerifierResult> {
    const checks: CheckResult[] = [];
    const { cwd } = opts;

    // 1. Type checker
    const tcInfo = await detectTypeChecker(cwd);
    if (tcInfo !== null) {
      checks.push(await runCheck('typecheck', tcInfo.cmd, tcInfo.args, cwd));
    }

    // 2. Linter
    const lintInfo = await detectLinter(cwd);
    if (lintInfo !== null) {
      checks.push(await runCheck('lint', lintInfo.cmd, lintInfo.args, cwd));
    }

    // 3. AST diff (did we change the expected files?)
    const changedFiles = await getChangedFiles(cwd);
    checks.push(checkAstDiff(step, changedFiles));

    const passed = checks.every((c) => c.passed);
    return { passed, checks };
  }
}
