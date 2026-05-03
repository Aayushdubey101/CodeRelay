import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";

export const log: Logger = createLogger("@coderelay/sub-agents");

export { runAgent } from "./runner.js";
export type { AgentName, RunOptions } from "./runner.js";

export { runClaudeCode, generateMcpConfig, defaultMcpServerConfig } from "./providers/claude-code.js";
export type { ClaudeCodeOptions, McpServerConfig } from "./providers/claude-code.js";

export { runGeminiCli, defaultGeminiMcpConfig } from "./providers/gemini-cli.js";
export type { GeminiCliOptions } from "./providers/gemini-cli.js";
