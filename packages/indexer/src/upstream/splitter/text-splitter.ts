/* Adapted from zilliztech/claude-context@ead19f4, MIT. See LICENSES/claude-context-LICENSE.txt */
/* NOTE: Upstream uses native tree-sitter (ast-splitter.ts). This is a
   regex-based drop-in replacement pending web-tree-sitter (WASM) in task 2.3.
   Interface is identical to upstream's AstCodeSplitter. */

import { type Splitter, type CodeChunk } from './index.js';

const TOP_LEVEL_PATTERNS: Record<string, RegExp> = {
  typescript: /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?\s+\w|class\s+\w|interface\s+\w|type\s+\w|enum\s+\w|abstract\s+class\s+\w|const\s+\w|let\s+\w)/,
  javascript: /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?\s+\w|class\s+\w|const\s+\w|let\s+\w|var\s+\w)/,
  python: /^(?:async\s+)?(?:def|class)\s+\w/,
  java: /^(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)+.*\s+\w+\s*[({]/,
  go: /^(?:func|type|var|const)\s+\w/,
  rust: /^(?:pub(?:\s*\([^)]*\))?\s+)?(?:fn|struct|enum|trait|impl|type|const|static|mod)\s+\w/,
  cpp: /^(?:[\w:*&<>]+\s+)+\w+\s*\(/,
  csharp: /^(?:(?:public|private|protected|internal|static|abstract|virtual|override|sealed)\s+)+\w/,
};

export class TextCodeSplitter implements Splitter {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize = 2500, chunkOverlap = 300) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  async split(code: string, language: string, filePath?: string): Promise<CodeChunk[]> {
    const lines = code.split('\n');
    const lang = language.toLowerCase();
    const pattern = TOP_LEVEL_PATTERNS[lang] ?? TOP_LEVEL_PATTERNS['typescript']!;
    const boundaries = this.findBoundaries(lines, pattern);
    const raw = this.buildChunks(lines, boundaries, lang, filePath);
    return this.addOverlap(raw);
  }

  setChunkSize(chunkSize: number): void {
    this.chunkSize = chunkSize;
  }

  setChunkOverlap(chunkOverlap: number): void {
    this.chunkOverlap = chunkOverlap;
  }

  static isLanguageSupported(language: string): boolean {
    return Object.prototype.hasOwnProperty.call(TOP_LEVEL_PATTERNS, language.toLowerCase());
  }

  private findBoundaries(lines: string[], pattern: RegExp): number[] {
    const points: number[] = [0];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trimStart() ?? '';
      if (line.length > 0 && pattern.test(line)) {
        points.push(i);
      }
    }
    return points;
  }

  private buildChunks(
    lines: string[],
    boundaries: number[],
    language: string,
    filePath: string | undefined,
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    for (let i = 0; i < boundaries.length; i++) {
      const start = boundaries[i] ?? 0;
      const end = (boundaries[i + 1] ?? lines.length) - 1;
      const content = lines.slice(start, end + 1).join('\n').trimEnd();
      if (content.length === 0) continue;

      if (content.length <= this.chunkSize) {
        chunks.push(this.makeChunk(content, start + 1, end + 1, language, filePath));
      } else {
        chunks.push(...this.splitLarge(content, start + 1, language, filePath));
      }
    }

    return chunks.length > 0
      ? chunks
      : this.splitLarge(lines.join('\n'), 1, language, filePath);
  }

  private splitLarge(
    content: string,
    startLineOffset: number,
    language: string,
    filePath: string | undefined,
  ): CodeChunk[] {
    const result: CodeChunk[] = [];
    const allLines = content.split('\n');
    let offset = 0;

    while (offset < allLines.length) {
      let end = offset;
      let size = 0;
      while (end < allLines.length && size + (allLines[end]?.length ?? 0) + 1 <= this.chunkSize) {
        size += (allLines[end]?.length ?? 0) + 1;
        end++;
      }
      if (end === offset) end = offset + 1;

      const chunkContent = allLines.slice(offset, end).join('\n').trimEnd();
      if (chunkContent.length > 0) {
        result.push(
          this.makeChunk(
            chunkContent,
            startLineOffset + offset,
            startLineOffset + end - 1,
            language,
            filePath,
          ),
        );
      }

      const overlapLines = Math.max(1, Math.floor(this.chunkOverlap / 80));
      offset = Math.max(offset + 1, end - overlapLines);
    }

    return result;
  }

  private makeChunk(
    content: string,
    startLine: number,
    endLine: number,
    language: string,
    filePath: string | undefined,
  ): CodeChunk {
    const chunk: CodeChunk = {
      content,
      metadata: { startLine, endLine, language },
    };
    if (filePath !== undefined) {
      chunk.metadata.filePath = filePath;
    }
    return chunk;
  }

  private addOverlap(chunks: CodeChunk[]): CodeChunk[] {
    if (chunks.length <= 1 || this.chunkOverlap <= 0) return chunks;

    return chunks.map((chunk, i) => {
      if (i === 0) return chunk;
      const prev = chunks[i - 1]!;
      const overlapText = prev.content.slice(-this.chunkOverlap);
      const extraLines = overlapText.split('\n').length;
      return {
        content: overlapText + '\n' + chunk.content,
        metadata: {
          ...chunk.metadata,
          startLine: Math.max(1, chunk.metadata.startLine - extraLines),
        },
      };
    });
  }
}
