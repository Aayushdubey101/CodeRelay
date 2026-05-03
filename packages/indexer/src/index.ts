import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";

export const log: Logger = createLogger("@coderelay/indexer");

export { openGraphDb } from "./db/index.js";
export type { FileRow, SymbolRow, EdgeRow, ChunkRow } from "./db/index.js";

export { SymbolExtractor } from "./extract.js";
export type { ExtractedSymbol, ExtractedEdge, ExtractResult, SymbolKind, EdgeKind } from "./extract.js";

export { EdgeResolver } from "./resolver.js";
export type { ResolvedEdge, ResolutionStrategy } from "./resolver.js";

export { LanceVectorStore } from "./upstream/vectordb/lancedb.js";
export type { VectorDatabase, VectorDocument, SearchOptions, VectorSearchResult } from "./upstream/vectordb/types.js";

export { IndexPipeline } from "./pipeline.js";
export type { PipelineOptions, IndexStats } from "./pipeline.js";
