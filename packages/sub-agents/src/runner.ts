import { runClaudeCode, defaultMcpServerConfig, type ClaudeCodeOptions } from './providers/claude-code.js';
import { runGeminiCli, defaultGeminiMcpConfig, type GeminiCliOptions } from './providers/gemini-cli.js';

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
}

export async function runAgent(opts: RunOptions): Promise<string> {
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
