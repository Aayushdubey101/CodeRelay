import { runClaudeCode, defaultMcpServerConfig, type ClaudeCodeOptions } from './providers/claude-code.js';
import { runGeminiCli, defaultGeminiMcpConfig, type GeminiCliOptions } from './providers/gemini-cli.js';
import { Governor } from '@coderelay/governor';

export type AgentName = 'claude' | 'gemini';

export interface RunOptions {
  agent: AgentName;
  prompt: string;
  mcpServerBinPath?: string;
  model?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  cwd?: string;
  timeoutMs?: number;
  /** Optional governor for pre-flight command safety checks. */
  governor?: Governor;
}

/** Extract bare shell commands from a prompt string for governor pre-flight. */
export function extractCommands(prompt: string): string[] {
  const lines = prompt.split('\n');
  const cmds: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    // Lines starting with $, #!, or backtick-code-block shell commands
    if (t.startsWith('$ ')) cmds.push(t.slice(2));
    else if (t.startsWith('`') && t.endsWith('`')) cmds.push(t.slice(1, -1));
    // Also push the raw line for blocklist pattern matching on the whole prompt
    else if (t.length > 0) cmds.push(t);
  }
  return cmds;
}

export async function runAgent(opts: RunOptions): Promise<string> {
  if (opts.governor !== undefined) {
    const gov = opts.governor;
    const candidates = extractCommands(opts.prompt);
    for (const cmd of candidates) {
      const result = gov.checkCommand(cmd);
      if (!result.allowed) {
        throw new Error(`Governor pre-flight blocked: ${result.reason}`);
      }
    }
  }

  const mcpBin = opts.mcpServerBinPath;

  if (opts.agent === 'claude') {
    const claudeOpts: ClaudeCodeOptions = { mcpServers: { coderelay: defaultMcpServerConfig(mcpBin) } };
    if (opts.model) claudeOpts.model = opts.model;
    if (opts.systemPrompt) claudeOpts.systemPrompt = opts.systemPrompt;
    if (opts.allowedTools) claudeOpts.allowedTools = opts.allowedTools;
    if (opts.cwd) claudeOpts.cwd = opts.cwd;
    if (opts.timeoutMs) claudeOpts.timeoutMs = opts.timeoutMs;
    return runClaudeCode(opts.prompt, claudeOpts);
  }

  if (opts.agent === 'gemini') {
    const geminiOpts: GeminiCliOptions = { mcpServers: { coderelay: defaultGeminiMcpConfig(mcpBin) } };
    if (opts.model) geminiOpts.model = opts.model;
    if (opts.systemPrompt) geminiOpts.systemPrompt = opts.systemPrompt;
    if (opts.cwd) geminiOpts.cwd = opts.cwd;
    if (opts.timeoutMs) geminiOpts.timeoutMs = opts.timeoutMs;
    return runGeminiCli(opts.prompt, geminiOpts);
  }

  throw new Error(`Unknown agent: ${String(opts.agent)}`);
}
