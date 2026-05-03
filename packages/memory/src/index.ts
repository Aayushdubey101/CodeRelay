import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";

export const log: Logger = createLogger("@coderelay/memory");

export { WorkingMemory } from "./working.js";
export { SessionMemory } from "./session.js";
export type { TurnRow, SessionRow, SessionMemoryOptions, Summarizer } from "./session.js";
