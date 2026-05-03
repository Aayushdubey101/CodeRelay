/* Logic ported from awslabs/cli-agent-orchestrator@1f2a048, Apache-2.0. See LICENSES/cao-LICENSE.txt */

import { execa } from 'execa';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { McpServerConfig } from './claude-code.js';

export interface GeminiCliOptions {
  model?: string;
  systemPrompt?: string;
  mcpServers?: Record<string, McpServerConfig>;
  cwd?: string;
  timeoutMs?: number;
  taskId?: string;
}

function geminiSettingsPath(): string {
  return join(homedir(), '.gemini', 'settings.json');
}

function readGeminiSettings(): Record<string, unknown> {
  const p = geminiSettingsPath();
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>; }
  catch { return {}; }
}

function writeGeminiSettings(settings: Record<string, unknown>): void {
  const dir = join(homedir(), '.gemini');
  mkdirSync(dir, { recursive: true });
  writeFileSync(geminiSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function registerMcpServers(servers: Record<string, McpServerConfig>): void {
  const settings = readGeminiSettings();
  const existing = (settings['mcpServers'] ?? {}) as Record<string, unknown>;
  for (const [name, cfg] of Object.entries(servers)) {
    existing[name] = { command: cfg.command, args: cfg.args ?? [], env: cfg.env ?? {} };
  }
  settings['mcpServers'] = existing;
  writeGeminiSettings(settings);
}

export async function runGeminiCli(
  prompt: string,
  opts: GeminiCliOptions = {},
): Promise<string> {
  const cwd = opts.cwd ?? process.cwd();

  // Write system prompt as GEMINI.md in cwd
  if (opts.systemPrompt) {
    writeFileSync(join(cwd, 'GEMINI.md'), opts.systemPrompt, 'utf8');
  }

  // Register MCP servers in ~/.gemini/settings.json
  if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
    registerMcpServers(opts.mcpServers);
  }

  const args: string[] = ['--yolo'];
  if (opts.model) args.push('--model', opts.model);
  args.push('-p', prompt);

  const result = await execa('gemini', args, {
    cwd,
    timeout: opts.timeoutMs ?? 300_000,
    reject: false,
  });

  return result.stdout ?? '';
}

export function defaultGeminiMcpConfig(mcpServerBinPath?: string): McpServerConfig {
  const binPath = mcpServerBinPath ?? resolve(process.cwd(), 'packages/mcp-server/dist/index.js');
  return { command: 'node', args: [binPath] };
}
