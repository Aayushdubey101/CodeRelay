/* Adapted from zilliztech/claude-context@3675469, MIT. See LICENSES/claude-context-LICENSE.txt
   Scaffold pattern (stdio redirect + McpServer bootstrap) taken from upstream;
   all tool implementations are original CodeRelay work. */

// Redirect console.log/info/warn to stderr so we don't corrupt the stdio MCP protocol.
const _origLog = console.log.bind(console);
console.log = (...a) => process.stderr.write(a.join(' ') + '\n');
console.info = (...a) => process.stderr.write(a.join(' ') + '\n');
console.warn = (...a) => process.stderr.write('[warn] ' + a.join(' ') + '\n');

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { openGraphDb } from '@coderelay/indexer';
import { LongTermMemory } from '@coderelay/memory';
import { appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CodeRelayServerOptions {
  graphDbPath?: string;
  longTermDbPath?: string;
  projectMdPath?: string;
}

interface SymbolRow { id: number; name: string; qualified_name: string; kind: string; signature: string | null; start: number; end: number; file_id: number; }
interface FilePath { path: string; }
interface ChunkRow { content: string; token_count: number; }
interface EdgeRow { dst: number; src: number; }

type GraphDb = ReturnType<typeof openGraphDb>;

function getFilePath(db: GraphDb, fileId: number): string {
  const r = db.prepare<[number], FilePath>('SELECT path FROM files WHERE id = ?').get(fileId) as FilePath | undefined;
  return r?.path ?? '(unknown)';
}

function buildServer(opts: CodeRelayServerOptions): McpServer {
  const mcp = new McpServer({ name: 'coderelay', version: '0.0.0' });

  // Lazy-open graph DB on first tool call
  let _db: ReturnType<typeof openGraphDb> | null = null;
  const db = (): ReturnType<typeof openGraphDb> => {
    if (_db === null) _db = openGraphDb(opts.graphDbPath);
    return _db;
  };

  let _mem: LongTermMemory | null = null;
  const mem = (): LongTermMemory => {
    if (_mem === null) _mem = new LongTermMemory(opts.longTermDbPath ? { dbPath: opts.longTermDbPath } : {});
    return _mem;
  };

  // ── get_relevant_context ──────────────────────────────────────────────────
  mcp.registerTool(
    'get_relevant_context',
    {
      description: 'Retrieve most relevant code chunks for a query, respecting a token budget.',
      inputSchema: { query: z.string(), max_tokens: z.number().int().positive().default(4000) },
    },
    async ({ query, max_tokens }) => {
      const rows = db()
        .prepare<[string, number], ChunkRow & { path: string }>(
          `SELECT c.content, c.token_count, f.path
           FROM chunks c
           JOIN files f ON c.file_id = f.id
           WHERE c.content LIKE ?
           ORDER BY c.token_count ASC
           LIMIT ?`,
        )
        .all(`%${query}%`, 50) as Array<ChunkRow & { path: string }>;

      let budget = max_tokens;
      const selected: Array<{ path: string; content: string; tokens: number }> = [];
      for (const r of rows) {
        if (r.token_count > budget) continue;
        selected.push({ path: r.path, content: r.content, tokens: r.token_count });
        budget -= r.token_count;
        if (budget <= 0) break;
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ query, budget_used: max_tokens - budget, chunks: selected }) }],
      };
    },
  );

  // ── get_symbol ────────────────────────────────────────────────────────────
  mcp.registerTool(
    'get_symbol',
    {
      description: 'Get definition and signature for a qualified symbol name.',
      inputSchema: { qualified_name: z.string() },
    },
    async ({ qualified_name }) => {
      const sym = db()
        .prepare<[string], SymbolRow>('SELECT * FROM symbols WHERE qualified_name = ?')
        .get(qualified_name) as SymbolRow | undefined;

      if (sym === undefined) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Symbol not found: ${qualified_name}` }) }] };
      }

      const filePath = getFilePath(db(), sym.file_id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ...sym, file: filePath }) }],
      };
    },
  );

  // ── get_callers ───────────────────────────────────────────────────────────
  mcp.registerTool(
    'get_callers',
    {
      description: 'Get all symbols that call a given qualified name.',
      inputSchema: { qualified_name: z.string() },
    },
    async ({ qualified_name }) => {
      const target = db()
        .prepare<[string], { id: number }>('SELECT id FROM symbols WHERE qualified_name = ?')
        .get(qualified_name) as { id: number } | undefined;

      if (target === undefined) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ callers: [] }) }] };
      }

      const callers = db()
        .prepare<[number], SymbolRow>(
          `SELECT s.* FROM symbols s
           JOIN edges e ON e.src = s.id
           WHERE e.dst = ? AND e.kind = 'calls'`,
        )
        .all(target.id) as SymbolRow[];

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ qualified_name, callers: callers.map((s) => ({ name: s.qualified_name, kind: s.kind, file: getFilePath(db(), s.file_id) })) }) }],
      };
    },
  );

  // ── get_callees ───────────────────────────────────────────────────────────
  mcp.registerTool(
    'get_callees',
    {
      description: 'Get all symbols called by a given qualified name.',
      inputSchema: { qualified_name: z.string() },
    },
    async ({ qualified_name }) => {
      const src = db()
        .prepare<[string], { id: number }>('SELECT id FROM symbols WHERE qualified_name = ?')
        .get(qualified_name) as { id: number } | undefined;

      if (src === undefined) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ callees: [] }) }] };
      }

      const callees = db()
        .prepare<[number], SymbolRow>(
          `SELECT s.* FROM symbols s
           JOIN edges e ON e.dst = s.id
           WHERE e.src = ? AND e.kind = 'calls'`,
        )
        .all(src.id) as SymbolRow[];

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ qualified_name, callees: callees.map((s) => ({ name: s.qualified_name, kind: s.kind, file: getFilePath(db(), s.file_id) })) }) }],
      };
    },
  );

  // ── get_file_summary ──────────────────────────────────────────────────────
  mcp.registerTool(
    'get_file_summary',
    {
      description: 'Get a summary of a file: its symbols and top-level imports.',
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      const file = db()
        .prepare<[string], { id: number; hash: string; lang: string; mtime: number }>(
          'SELECT id, hash, lang, mtime FROM files WHERE path = ?',
        )
        .get(path) as { id: number; hash: string; lang: string; mtime: number } | undefined;

      if (file === undefined) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `File not indexed: ${path}` }) }] };
      }

      const symbols = db()
        .prepare<[number], { name: string; kind: string; qualified_name: string }>(
          'SELECT name, kind, qualified_name FROM symbols WHERE file_id = ? ORDER BY start ASC',
        )
        .all(file.id) as Array<{ name: string; kind: string; qualified_name: string }>;

      const chunkCount = (db()
        .prepare<[number], { n: number }>('SELECT COUNT(*) AS n FROM chunks WHERE file_id = ?')
        .get(file.id) as { n: number }).n;

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ path, lang: file.lang, symbols, chunk_count: chunkCount }) }],
      };
    },
  );

  // ── search_semantic ───────────────────────────────────────────────────────
  mcp.registerTool(
    'search_semantic',
    {
      description: 'Search indexed code chunks by keyword (SQL LIKE fallback; vector search if embeddings are configured).',
      inputSchema: { query: z.string(), k: z.number().int().positive().default(10) },
    },
    async ({ query, k }) => {
      const rows = db()
        .prepare<[string, number], ChunkRow & { path: string }>(
          `SELECT c.content, c.token_count, f.path
           FROM chunks c
           JOIN files f ON c.file_id = f.id
           WHERE c.content LIKE ?
           LIMIT ?`,
        )
        .all(`%${query}%`, k) as Array<ChunkRow & { path: string }>;

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ query, results: rows.map((r) => ({ path: r.path, content: r.content.slice(0, 400), tokens: r.token_count })) }) }],
      };
    },
  );

  // ── find_similar_code ─────────────────────────────────────────────────────
  mcp.registerTool(
    'find_similar_code',
    {
      description: 'Find code chunks similar to the provided snippet.',
      inputSchema: { snippet: z.string(), k: z.number().int().positive().default(5) },
    },
    async ({ snippet, k }) => {
      // SQL LIKE fallback — take first 40 chars of snippet as search key
      const keyword = snippet.trim().slice(0, 40);
      const rows = db()
        .prepare<[string, number], ChunkRow & { path: string }>(
          `SELECT c.content, c.token_count, f.path
           FROM chunks c
           JOIN files f ON c.file_id = f.id
           WHERE c.content LIKE ?
           LIMIT ?`,
        )
        .all(`%${keyword}%`, k) as Array<ChunkRow & { path: string }>;

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ results: rows.map((r) => ({ path: r.path, preview: r.content.slice(0, 300) })) }) }],
      };
    },
  );

  // ── get_dependency_tree ───────────────────────────────────────────────────
  mcp.registerTool(
    'get_dependency_tree',
    {
      description: 'Get files that the given file depends on (via import edges), up to 2 hops.',
      inputSchema: { path: z.string(), depth: z.number().int().min(1).max(3).default(2) },
    },
    async ({ path, depth }) => {
      const file = db()
        .prepare<[string], { id: number }>('SELECT id FROM files WHERE path = ?')
        .get(path) as { id: number } | undefined;

      if (file === undefined) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `File not indexed: ${path}` }) }] };
      }

      const visited = new Set<number>([file.id]);
      const tree: Array<{ from: string; to: string; via: string }> = [];

      const expand = (fileId: number, remaining: number): void => {
        if (remaining <= 0) return;
        const syms = db()
          .prepare<[number], { id: number }>('SELECT id FROM symbols WHERE file_id = ?')
          .all(fileId) as { id: number }[];
        for (const sym of syms) {
          const edges = db()
            .prepare<[number], EdgeRow & { dst_file_id: number }>(
              `SELECT e.dst, e.src, s.file_id AS dst_file_id
               FROM edges e
               JOIN symbols s ON s.id = e.dst
               WHERE e.src = ? AND e.kind = 'imports'`,
            )
            .all(sym.id) as Array<EdgeRow & { dst_file_id: number }>;
          for (const edge of edges) {
            if (!visited.has(edge.dst_file_id)) {
              visited.add(edge.dst_file_id);
              const dstPath = getFilePath(db(), edge.dst_file_id);
              tree.push({ from: path, to: dstPath, via: 'imports' });
              expand(edge.dst_file_id, remaining - 1);
            }
          }
        }
      };

      expand(file.id, depth);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ path, depth, dependencies: tree }) }] };
    },
  );

  // ── recall_fact ───────────────────────────────────────────────────────────
  mcp.registerTool(
    'recall_fact',
    {
      description: 'Search long-term memory for facts matching a query.',
      inputSchema: { query: z.string(), limit: z.number().int().positive().default(5) },
    },
    async ({ query, limit }) => {
      const facts = await mem().searchText(query, limit);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ query, facts: facts.map((f) => ({ id: f.id, text: f.text, tags: f.tags, ts: f.ts })) }) }],
      };
    },
  );

  // ── record_decision ───────────────────────────────────────────────────────
  mcp.registerTool(
    'record_decision',
    {
      description: 'Record an architectural decision to long-term memory and append it to PROJECT.md.',
      inputSchema: { text: z.string(), tags: z.array(z.string()).default([]) },
    },
    async ({ text, tags }) => {
      const id = await mem().recordFact(text, tags);

      const projectMd = opts.projectMdPath ?? join(process.cwd(), 'PROJECT.md');
      const entry = `\n## Decision — ${new Date().toISOString()}\n\n${text}\n`;
      try {
        if (existsSync(projectMd)) {
          appendFileSync(projectMd, entry, 'utf8');
        } else {
          writeFileSync(projectMd, `# Project Decisions\n${entry}`, 'utf8');
        }
      } catch { /* ignore fs errors */ }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ id, text, tags }) }] };
    },
  );

  return mcp;
}

export async function startServer(opts: CodeRelayServerOptions = {}): Promise<void> {
  const mcp = buildServer(opts);
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  _origLog('[coderelay-mcp] server started on stdio');
}
