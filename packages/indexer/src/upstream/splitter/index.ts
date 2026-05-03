/* Adapted from zilliztech/claude-context@ead19f4, MIT. See LICENSES/claude-context-LICENSE.txt */

export interface CodeChunk {
  content: string;
  metadata: {
    startLine: number;
    endLine: number;
    language?: string | undefined;
    filePath?: string | undefined;
  };
}

export enum SplitterType {
  TEXT = 'text',
  AST = 'ast',
}

export interface SplitterConfig {
  type?: SplitterType;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface Splitter {
  split(code: string, language: string, filePath?: string): Promise<CodeChunk[]>;
  setChunkSize(chunkSize: number): void;
  setChunkOverlap(chunkOverlap: number): void;
}

export * from './text-splitter.js';
