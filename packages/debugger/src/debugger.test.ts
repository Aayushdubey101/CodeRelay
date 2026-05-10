import { describe, it, expect } from 'vitest';
import { parseLogContent } from './parser.js';

const SAMPLE_LOG = `
2024-01-15T10:23:45 ERROR Failed to connect to database
    at connectDb (/app/src/db.ts:45:12)
    at bootstrap (/app/src/server.ts:12:5)

2024-01-15T10:23:46 WARN Retrying in 5s...
`;

const ANSI_LOG = '\x1b[31mERROR\x1b[0m Something failed\n    at handler (/app/src/handler.ts:10:3)';

describe('parseLogContent', () => {
  it('parses error entries', () => {
    const entries = parseLogContent(SAMPLE_LOG);
    expect(entries.some(e => e.level === 'error')).toBe(true);
  });

  it('extracts stack frames', () => {
    const entries = parseLogContent(SAMPLE_LOG);
    const err = entries.find(e => e.level === 'error');
    expect(err?.stack).toBeDefined();
    expect(err?.stack?.length).toBe(2);
    expect(err?.stack?.[0]?.fn).toBe('connectDb');
    expect(err?.stack?.[0]?.file).toContain('db.ts');
    expect(err?.stack?.[0]?.line).toBe(45);
  });

  it('extracts timestamps', () => {
    const entries = parseLogContent(SAMPLE_LOG);
    const err = entries.find(e => e.level === 'error');
    expect(err?.timestamp).toBe('2024-01-15T10:23:45');
  });

  it('strips ANSI codes', () => {
    const entries = parseLogContent(ANSI_LOG);
    expect(entries[0]?.message).not.toContain('\x1b');
  });

  it('detects warn level', () => {
    const entries = parseLogContent(SAMPLE_LOG);
    expect(entries.some(e => e.level === 'warn')).toBe(true);
  });

  it('handles empty input', () => {
    expect(parseLogContent('')).toEqual([]);
  });
});
