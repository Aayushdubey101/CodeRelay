import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const execFileAsync = promisify(execFile);
const execShellAsync = promisify(exec);

export interface CheckRow {
  name: string;
  required: boolean;
  ok: boolean;
  detail: string;
}

export type ToolChecker = (cmd: string, args: string[]) => Promise<{ ok: boolean; detail: string }>;
export type HttpChecker = (url: string) => Promise<{ ok: boolean; detail: string }>;

export async function defaultToolChecker(cmd: string, args: string[]): Promise<{ ok: boolean; detail: string }> {
  try {
    let stdout: string;
    if (process.platform === 'win32') {
      const result = await execShellAsync(`${cmd} ${args.join(' ')}`, { timeout: 5000 });
      stdout = result.stdout;
    } else {
      const result = await execFileAsync(cmd, args, { timeout: 5000 });
      stdout = result.stdout;
    }
    const line = (stdout ?? '').trim().split('\n')[0] ?? '';
    return { ok: true, detail: line };
  } catch {
    return { ok: false, detail: 'not found' };
  }
}

export async function defaultHttpChecker(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { ok: resp.ok, detail: resp.ok ? `HTTP ${resp.status}` : `HTTP ${resp.status}` };
  } catch {
    return { ok: false, detail: 'not reachable' };
  }
}

const DEFAULT_CONFIG = {
  version: 1,
  router: { defaultProvider: 'ollama' },
  agents: { default: 'claude', timeoutMs: 300000 },
  indexer: { dbPath: '.coderelay/graph.db' },
  memory: { sessionDb: '.coderelay/session.db', longTermDb: '.coderelay/longterm.db' },
};

export async function gatherChecks(
  checkTool: ToolChecker = defaultToolChecker,
  checkHttp: HttpChecker = defaultHttpChecker,
): Promise<CheckRow[]> {
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

  const ollama = await checkHttp('http://localhost:11434/api/tags');
  checks.push({ name: 'ollama', required: false, ok: ollama.ok, detail: ollama.ok ? 'running on :11434' : 'not running — ollama.ai' });

  const dir = join(homedir(), '.coderelay');
  try {
    mkdirSync(dir, { recursive: true });

    const configPath = join(dir, 'config.json');
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    }

    const credPath = join(dir, 'credentials.json');
    if (!existsSync(credPath)) {
      writeFileSync(credPath, '{}', 'utf8');
    }

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
  console.log('\nAll required checks passed.');
  console.log('\nRun coderelay auth next to configure your AI providers.\n');
}
