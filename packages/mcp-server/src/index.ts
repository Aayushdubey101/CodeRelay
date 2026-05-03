#!/usr/bin/env node
import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";

export const log: Logger = createLogger("@coderelay/mcp-server");

export { startServer } from "./server.js";
export type { CodeRelayServerOptions } from "./server.js";

// Run server if executed directly
const isMain = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isMain) {
  const { startServer: start } = await import('./server.js');
  start().catch((err: unknown) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
