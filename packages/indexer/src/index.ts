import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";

export const log: Logger = createLogger("@coderelay/indexer");

export { openGraphDb } from "./db/index.js";
export type { FileRow, SymbolRow, EdgeRow, ChunkRow } from "./db/index.js";
