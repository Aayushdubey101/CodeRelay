import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const execAsync = promisify(execFile);

export interface CheckRow {
  name: string;
  required: boolean;
  ok: boolean;
  detail: string;
}

export type ToolChecker = (cmd: string, args: string[]) => Promise<{ ok: boolean; detail: string }>;

export async function defaultToolChecker(cmd: string, args: string[]): Promise<{ ok: boolean; detail: string }> {
  try {
    const { stdout } = await execAsync(cmd, args, { timeout: 5000 });
    const line = (stdout ?? '').trim().split('\n')[0] ?? '';
    return { ok: true, detail: line };
  } catch {
    return { ok: false, detail: 'not found' };
  }
}

export async function gatherChecks(checkTool: ToolChecker = defaultToolChecker): Promise<CheckRow[]> {
  const checks: CheckRow[] = [];

  const major = parseInt(process.version.slice(1), 10);
  checks.push({ name: 'Node.js >=20', required: true, ok: major >= 20, detail: process.version });

  const pnpm = await checkTool('pnpm', ['--version']);
  checks.push({ name: 'pnpm', required: true, ok: pnpm.ok, detail: pnpm.ok ? `v${pnpm.detail}` : 'not found — npm install -g pnpm' });

  const git = await checkTool('git', ['--version']);
  checks.push({ name: 'git', required: true, ok: git.ok, detail: git.detail });

  const claude = await checkTool('claude', ['--version']);
  checks.push({ name: 'claude CLI', required: false, ok: claude.ok, detail: claude.ok ? claude.detail : 'not found — anthropic.com/claude-code' });

  const gemini = await checkTool('gemini', ['--version']);
  checks.push({ name: 'gemini CLI', required: false, ok: gemini.ok, detail: gemini.ok ? gemini.detail : 'not found — npm i -g @google/gemini-cli' });

  const ollama = await checkTool('ollama', ['--version']);
  checks.push({ name: 'ollama', required: false, ok: ollama.ok, detail: ollama.ok ? ollama.detail : 'not found — ollama.ai' });

  const dir = join(homedir(), '.coderelay');
  try {
    mkdirSync(dir, { recursive: true });
    checks.push({ name: '~/.coderelay/', required: true, ok: true, detail: dir });
  } catch (err) {
    checks.push({ name: '~/.coderelay/', required: true, ok: false, detail: String(err) });
  }

  return checks;
}

export function printChecks(checks: CheckRow[]): void {
  console.log('\nCodeRelay Setup Check');
  console.log('─'.repeat(60));
  for (const c of checks) {
    const icon = c.ok ? '✓' : c.required ? '✗' : '○';
    const badge = c.required ? '[required]' : '[optional]';
    console.log(`  ${icon}  ${c.name.padEnd(20)} ${badge.padEnd(12)} ${c.detail}`);
  }
  console.log('─'.repeat(60));
}

export async function runSetup(): Promise<void> {
  const checks = await gatherChecks();
  printChecks(checks);

  const failures = checks.filter(c => !c.ok && c.required);
  if (failures.length > 0) {
    console.log(`\n${failures.length} required check(s) failed.\n`);
    process.exit(1);
  }
  console.log('\nAll required checks passed.\n');
}
