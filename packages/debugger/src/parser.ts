import { readFileSync } from 'node:fs';

export interface StackFrame {
  raw: string;
  fn?: string | undefined;
  file?: string | undefined;
  line?: number | undefined;
  col?: number | undefined;
}

export interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug' | 'unknown';
  message: string;
  stack?: StackFrame[] | undefined;
  timestamp?: string | undefined;
  raw: string;
}

export function parseLogFile(path: string): LogEntry[] {
  const content = readFileSync(path, 'utf8');
  return parseLogContent(content);
}

export function parseLogContent(content: string): LogEntry[] {
  const clean = stripAnsi(content);
  const lines = clean.split('\n');

  const entries: LogEntry[] = [];
  let current: LogEntry | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    if (current && /^\s+at /.test(line)) {
      current.stack = current.stack ?? [];
      current.stack.push(parseFrame(line.trim()));
      continue;
    }

    if (current) entries.push(current);
    current = parseLogLine(line);
  }

  if (current) entries.push(current);
  return entries;
}

function parseLogLine(line: string): LogEntry {
  return {
    level: detectLevel(line),
    message: line.trim(),
    timestamp: detectTimestamp(line),
    raw: line,
  };
}

function detectLevel(line: string): LogEntry['level'] {
  const l = line.toLowerCase();
  if (l.includes('error') || l.includes('fatal') || l.includes(' err:') || l.includes('"level":50')) return 'error';
  if (l.includes('warn') || l.includes('"level":40')) return 'warn';
  if (l.includes('info') || l.includes('"level":30')) return 'info';
  if (l.includes('debug') || l.includes('verbose') || l.includes('"level":20')) return 'debug';
  return 'unknown';
}

function detectTimestamp(line: string): string | undefined {
  const m = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  return m?.[0];
}

function parseFrame(trimmed: string): StackFrame {
  // "at FnName (/path/file.js:10:5)" or "at /path/file.js:10:5"
  const m = trimmed.match(/^at (?:(\S+) \()?(.+?):(\d+):(\d+)\)?$/);
  if (m) {
    return { raw: trimmed, fn: m[1], file: m[2], line: Number(m[3]), col: Number(m[4]) };
  }
  return { raw: trimmed };
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[mGKHF]/g, '');
}
