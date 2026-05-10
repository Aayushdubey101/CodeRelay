import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';

export interface DuplicateBlock {
  hash: string;
  files: Array<{ file: string; startLine: number }>;
  tokenCount: number;
}

export interface DuplicationResult {
  duplicates: DuplicateBlock[];
  duplicateLineRate: number;
}

const MIN_TOKENS = 40;

export function detectDuplication(
  dir: string,
  exts = ['.ts', '.js', '.tsx', '.jsx'],
): DuplicationResult {
  const files: string[] = [];
  walkDir(dir, exts, files);

  // Rolling window of normalized token sequences per file
  const blockMap = new Map<string, Array<{ file: string; startLine: number; lines: number }>>();

  let totalLines = 0;
  for (const file of files) {
    const lines = readLines(file);
    totalLines += lines.length;
    const blocks = rollingBlocks(lines, 8); // 8-line window
    for (const b of blocks) {
      const entry = { file, startLine: b.startLine, lines: b.lines };
      const existing = blockMap.get(b.hash);
      if (existing) existing.push(entry);
      else blockMap.set(b.hash, [entry]);
    }
  }

  const duplicates: DuplicateBlock[] = [];
  for (const [hash, occurrences] of blockMap) {
    if (occurrences.length < 2) continue;
    const tokenCount = occurrences[0]?.lines ?? 0;
    if (tokenCount < MIN_TOKENS / 8) continue; // rough token estimate: 8 tokens/line
    duplicates.push({ hash, files: occurrences.map(o => ({ file: o.file, startLine: o.startLine })), tokenCount: tokenCount * 8 });
  }

  const duplicateLines = duplicates.reduce((s, d) => s + d.tokenCount / 8, 0);
  return {
    duplicates,
    duplicateLineRate: totalLines ? duplicateLines / totalLines : 0,
  };
}

interface Block { hash: string; startLine: number; lines: number }

function rollingBlocks(lines: string[], windowSize: number): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i <= lines.length - windowSize; i++) {
    const window = lines.slice(i, i + windowSize).join('\n');
    const normalized = window.replace(/\s+/g, ' ').trim();
    if (normalized.length < 30) continue;
    const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
    blocks.push({ hash, startLine: i + 1, lines: windowSize });
  }
  return blocks;
}

function readLines(file: string): string[] {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//') && !l.startsWith('*'));
  } catch {
    return [];
  }
}

function walkDir(dir: string, exts: string[], acc: string[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkDir(full, exts, acc);
    else if (exts.includes(extname(full))) acc.push(full);
  }
}
