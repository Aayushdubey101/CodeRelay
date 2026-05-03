import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";

export const log: Logger = createLogger("@coderelay/memory");

export { WorkingMemory } from "./working.js";
export { SessionMemory } from "./session.js";
export type { TurnRow, SessionRow, SessionMemoryOptions, Summarizer } from "./session.js";

export { LongTermMemory } from "./longterm.js";
export type { FactRow, LongTermMemoryOptions, Embedding as LongTermEmbedding } from "./longterm.js";

export { ContextManifest } from "./manifest.js";
export type { ManifestEntry } from "./manifest.js";

export { ContextPager } from "./pager.js";
export type { ContextItem, ContextPagerOptions } from "./pager.js";
