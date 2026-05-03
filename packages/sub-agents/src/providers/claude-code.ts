/* Logic ported from awslabs/cli-agent-orchestrator@1f2a048, Apache-2.0. See LICENSES/cao-LICENSE.txt */

import { execa } from 'execa';
import { resolve } from 'node:path';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ClaudeCodeOptions {
  model?: string;
  systemPrompt?: string;
  mcpServers?: Record<string, McpServerConfig>;
  allowedTools?: string[];   // CAO vocabulary: execute_bash, fs_read, fs_write, fs_*
  cwd?: string;
  timeoutMs?: number;
}

// CAO tool mapping: CAO vocabulary → Claude Code native tool names
const CAO_TO_CLAUDE: Record<string, string[]> = {
  execute_bash: ['Bash'],
  fs_read: ['Read'],
  fs_write: ['Edit', 'Write'],
  fs_list: ['Glob', 'Grep'],
  'fs_*': ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
};
const ALL_CLAUDE_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];

function resolveDisallowedTools(allowedTools?: string[]): string[] {
  if (allowedTools === undefined || allowedTools.includes('*')) return [];
  const allowed = new Set<string>();
  for (const t of allowedTools) {
    if (t.startsWith('@')) continue; // MCP tool reference — not a native tool
    for (const native of (CAO_TO_CLAUDE[t] ?? [])) allowed.add(native);
  }
  return ALL_CLAUDE_TOOLS.filter((t) => !allowed.has(t));
}

export function generateMcpConfig(servers: Record<string, McpServerConfig>): string {
  return JSON.stringify({ mcpServers: servers });
}

export async function runClaudeCode(
  prompt: string,
  opts: ClaudeCodeOptions = {},
): Promise<string> {
  const args: string[] = ['--dangerously-skip-permissions', '--print'];

  if (opts.model) args.push('--model', opts.model);

  if (opts.systemPrompt) {
    const escaped = opts.systemPrompt.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
    args.push('--append-system-prompt', escaped);
  }

  if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
    args.push('--mcp-config', generateMcpConfig(opts.mcpServers));
  }

  const disallowed = resolveDisallowedTools(opts.allowedTools);
  for (const tool of disallowed) {
    args.push('--disallowedTools', tool);
  }

  args.push(prompt);

  // Strip parent CLAUDE* env vars to avoid nested-session errors
  const cleanEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('CLAUDE') && !k.startsWith('CLAUDE_CODE_USE_') && !k.startsWith('CLAUDE_CODE_SKIP_')) {
      continue;
    }
    if (v !== undefined) cleanEnv[k] = v;
  }

  const result = await execa('claude', args, {
    cwd: opts.cwd ?? process.cwd(),
    env: cleanEnv,
    timeout: opts.timeoutMs ?? 300_000,
    reject: false,
  });

  return result.stdout ?? '';
}

export function defaultMcpServerConfig(mcpServerBinPath?: string): McpServerConfig {
  const binPath = mcpServerBinPath ?? resolve(process.cwd(), 'packages/mcp-server/dist/index.js');
  return { command: 'node', args: [binPath] };
}
