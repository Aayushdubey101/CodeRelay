import pino, { type Logger } from "pino";

const isDev = process.env["NODE_ENV"] !== "production";

export function createLogger(name: string): Logger {
  return pino(
    {
      name,
      level: process.env["LOG_LEVEL"] ?? "info",
    },
    isDev
      ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
      : undefined
  );
}

export const log: Logger = createLogger("@coderelay/core");
