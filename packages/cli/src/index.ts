#!/usr/bin/env node
import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";
import { Command } from "commander";
import { UsageTracker } from "@coderelay/router";
import { openGraphDb, IndexPipeline } from "@coderelay/indexer";
import { LongTermMemory } from "@coderelay/memory";
import { runAgent, type AgentName } from "@coderelay/sub-agents";
import { ActionLog, defaultLogPath, rollbackWorktree } from "@coderelay/governor";
import { execa } from "execa";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

export const log: Logger = createLogger("@coderelay/cli");

// ---------------------------------------------------------------------------
// File walking helpers
// ---------------------------------------------------------------------------

const LANG_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".c": "cpp", ".h": "cpp", ".hpp": "cpp",
};

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".lance", ".coderelay"]);

function detectLang(ext: string): string | undefined {
  return LANG_MAP[ext.toLowerCase()];
}

interface WalkEntry { path: string; lang: string; mtime: number; }

async function walkFiles(dir: string): Promise<WalkEntry[]> {
  const abs = resolve(dir);
  const results: WalkEntry[] = [];

  async function recurse(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = join(current, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await recurse(full);
      } else if (e.isFile()) {
        const lang = detectLang(extname(e.name));
        if (lang !== undefined) {
          let mtime = Date.now();
          try { mtime = (await stat(full)).mtimeMs; } catch { /* ignore */ }
          results.push({ path: full, lang, mtime });
        }
      }
    }
  }

  await recurse(abs);
  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("coderelay")
  .description("CLI orchestrator wrapping coding agents with shared graph, memory, and governance")
  .version("0.0.0");

// --- usage ---
program
  .command("usage")
  .description("Show LLM usage statistics")
  .option("--today", "Show only today's usage", false)
  .action((opts: { today: boolean }) => {
    const tracker = new UsageTracker();
    const rows = opts.today ? tracker.queryToday() : tracker.queryToday();
    tracker.close();

    if (rows.length === 0) {
      console.log("No usage data found.");
      return;
    }

    const totalTokensIn = rows.reduce((n, r) => n + r.tokens_in, 0);
    const totalTokensOut = rows.reduce((n, r) => n + r.tokens_out, 0);
    const totalCost = rows.reduce((n, r) => n + r.cost_usd, 0);

    console.log("\nUsage Report" + (opts.today ? " — Today" : ""));
    console.log("─".repeat(80));
    console.log(
      "Provider".padEnd(12) + "Model".padEnd(30) + "Tag".padEnd(12) +
        "TokIn".padStart(8) + "TokOut".padStart(8) + "Cost$".padStart(10)
    );
    console.log("─".repeat(80));

    for (const r of rows) {
      console.log(
        r.provider.padEnd(12) + r.model.padEnd(30) + r.tag.padEnd(12) +
          String(r.tokens_in).padStart(8) + String(r.tokens_out).padStart(8) +
          ("$" + r.cost_usd.toFixed(6)).padStart(10)
      );
    }

    console.log("─".repeat(80));
    console.log(
      "TOTAL".padEnd(54) + String(totalTokensIn).padStart(8) +
        String(totalTokensOut).padStart(8) + ("$" + totalCost.toFixed(6)).padStart(10)
    );
    console.log();
  });

// --- migrate ---
program
  .command("migrate")
  .description("Create or migrate the code graph database")
  .option("--path <path>", "Path to graph.db (default: .coderelay/graph.db)")
  .action((opts: { path?: string }) => {
    const db = openGraphDb(opts.path);
    const tables = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]
    ).map((r) => r.name);
    db.close();
    console.log(`Migration complete. Tables: ${tables.join(", ")}`);
  });

// --- index ---
program
  .command("index <path>")
  .description("Index source files into the code graph database")
  .option("--db <path>", "Path to graph.db", ".coderelay/graph.db")
  .action(async (inputPath: string, opts: { db: string }) => {
    const start = Date.now();
    console.log(`Scanning ${resolve(inputPath)} ...`);

    const files = await walkFiles(inputPath);
    console.log(`Found ${files.length} source file(s). Indexing...`);

    if (files.length === 0) {
      console.log("Nothing to index.");
      return;
    }

    const pipeline = await IndexPipeline.create({ graphDbPath: opts.db });

    const BATCH_SIZE = 50;
    let indexed = 0;
    let skipped = 0;
    let symbols = 0;
    let edges = 0;
    let chunks = 0;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const items: Array<{ path: string; code: string; lang: string; mtime: number }> = [];

      for (const f of batch) {
        try {
          const code = await readFile(f.path, "utf8");
          items.push({ path: f.path, code, lang: f.lang, mtime: f.mtime });
        } catch { /* skip unreadable files */ }
      }

      const s = await pipeline.indexFiles(items);
      indexed += s.filesIndexed;
      skipped += s.filesSkipped;
      symbols += s.symbolsInserted;
      edges += s.edgesInserted;
      chunks += s.chunksInserted;

      const done = Math.min(i + BATCH_SIZE, files.length);
      process.stdout.write(`\r  ${done}/${files.length} files processed...`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\nIndex complete in ${elapsed}s`);
    console.log("─".repeat(40));
    console.log(`  Files indexed : ${indexed}`);
    console.log(`  Files skipped : ${skipped}`);
    console.log(`  Symbols       : ${symbols}`);
    console.log(`  Edges         : ${edges}`);
    console.log(`  Chunks        : ${chunks}`);
    console.log(`  Database      : ${opts.db}`);
  });

// --- graph stats ---
const graphCmd = program
  .command("graph")
  .description("Code graph operations");

graphCmd
  .command("stats")
  .description("Print code graph statistics (files, symbols, edges, chunks)")
  .option("--db <path>", "Path to graph.db", ".coderelay/graph.db")
  .action((opts: { db: string }) => {
    const db = openGraphDb(opts.db);

    const n = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

    const files = n("files");
    const syms  = n("symbols");
    const edgs  = n("edges");
    const chnks = n("chunks");
    db.close();

    console.log("\nCode Graph Stats");
    console.log("─".repeat(30));
    console.log(`  Files   : ${files}`);
    console.log(`  Symbols : ${syms}`);
    console.log(`  Edges   : ${edgs}`);
    console.log(`  Chunks  : ${chnks}`);
    console.log();
  });

// --- search ---
program
  .command("search <query>")
  .description("Search indexed code chunks by keyword (SQL LIKE)")
  .option("--db <path>", "Path to graph.db", ".coderelay/graph.db")
  .option("-n, --limit <n>", "Max results to show", "5")
  .action((query: string, opts: { db: string; limit: string }) => {
    const db = openGraphDb(opts.db);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 5);

    interface Row { content: string; path: string; }
    const rows = db.prepare<[string, number], Row>(
      `SELECT c.content, f.path
       FROM chunks c
       JOIN files f ON c.file_id = f.id
       WHERE c.content LIKE ?
       LIMIT ?`
    ).all(`%${query}%`, limit) as Row[];

    db.close();

    if (rows.length === 0) {
      console.log(`No results for "${query}".`);
      return;
    }

    console.log(`\nSearch: "${query}" — ${rows.length} result(s)\n`);
    for (const [i, r] of rows.entries()) {
      console.log(`[${i + 1}] ${r.path}`);
      const preview = r.content.slice(0, 200).replace(/\n/g, " ").trim();
      console.log(`    ${preview}`);
      console.log();
    }
  });

// --- run ---
program
  .command("run <prompt>")
  .description("Run a prompt via a sub-agent (claude or gemini) with CodeRelay's MCP server")
  .option("--agent <name>", "Sub-agent to use: claude | gemini", "claude")
  .option("--model <model>", "Override model for the sub-agent")
  .option("--mcp-bin <path>", "Path to MCP server binary (default: auto-detect)")
  .option("--cwd <path>", "Working directory for sub-agent")
  .option("--timeout <ms>", "Timeout in milliseconds", "300000")
  .action(async (prompt: string, opts: { agent: string; model?: string; mcpBin?: string; cwd?: string; timeout: string }) => {
    const agent = opts.agent as AgentName;
    if (agent !== 'claude' && agent !== 'gemini') {
      console.error(`Unknown agent: ${agent}. Use 'claude' or 'gemini'.`);
      process.exit(1);
    }

    console.log(`Running via ${agent}...`);
    const runOpts = { agent, prompt, timeoutMs: parseInt(opts.timeout, 10) || 300_000 } as Parameters<typeof runAgent>[0];
    if (opts.model) runOpts.model = opts.model;
    if (opts.mcpBin) runOpts.mcpServerBinPath = opts.mcpBin;
    if (opts.cwd) runOpts.cwd = opts.cwd;
    const output = await runAgent(runOpts);

    console.log(output);
  });

// --- remember ---
program
  .command("remember <text>")
  .description("Save a fact to long-term memory")
  .option("--db <path>", "Path to longterm.db", ".coderelay/longterm.db")
  .option("--tags <tags>", "Comma-separated tags", "")
  .action(async (text: string, opts: { db: string; tags: string }) => {
    const mem = new LongTermMemory({ dbPath: opts.db });
    const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const id = await mem.recordFact(text, tags);
    mem.close();
    console.log(`Saved fact ${id}`);
  });

// --- recall ---
program
  .command("recall <query>")
  .description("Search long-term memory for facts matching a query")
  .option("--db <path>", "Path to longterm.db", ".coderelay/longterm.db")
  .option("-n, --limit <n>", "Max results", "5")
  .action(async (query: string, opts: { db: string; limit: string }) => {
    const mem = new LongTermMemory({ dbPath: opts.db });
    const limit = Math.max(1, parseInt(opts.limit, 10) || 5);
    const facts = await mem.searchText(query, limit);
    mem.close();

    if (facts.length === 0) {
      console.log(`No facts found for "${query}".`);
      return;
    }

    console.log(`\nRecall: "${query}" — ${facts.length} result(s)\n`);
    for (const [i, f] of facts.entries()) {
      const date = new Date(f.ts).toISOString().slice(0, 10);
      const tags = f.tags ? ` [${f.tags}]` : "";
      console.log(`[${i + 1}] (${date}${tags}) ${f.text}`);
    }
    console.log();
  });

// --- log ---
program
  .command("log")
  .description("Show action log entries for all tasks or a specific task")
  .option("--task <taskId>", "Filter by task ID")
  .option("--log-path <path>", "Path to action.log (default: .coderelay/action.log)")
  .action((opts: { task?: string; logPath?: string }) => {
    const logPath = opts.logPath ?? defaultLogPath(process.cwd());
    const al = new ActionLog(logPath);
    const entries = opts.task ? al.forTask(opts.task) : al.readAll();

    if (entries.length === 0) {
      console.log("No action log entries found.");
      return;
    }

    console.log(`\nAction Log — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}\n`);
    for (const e of entries) {
      const date = new Date(e.ts).toISOString().slice(0, 19).replace('T', ' ');
      const taskShort = e.taskId.slice(0, 8);
      const payloadStr = JSON.stringify(e.payload);
      const preview = payloadStr.length > 60 ? payloadStr.slice(0, 60) + '…' : payloadStr;
      console.log(`  ${date}  [${taskShort}]  ${e.kind.padEnd(16)}  ${preview}`);
    }
    console.log();
  });

// --- rollback ---
program
  .command("rollback <taskId>")
  .description("Rollback a task: remove its worktree branch (if pending) or revert its merge commit")
  .option("--log-path <path>", "Path to action.log (default: .coderelay/action.log)")
  .action(async (taskId: string, opts: { logPath?: string }) => {
    const repoRoot = process.cwd();
    const logPath = opts.logPath ?? defaultLogPath(repoRoot);
    const al = new ActionLog(logPath);
    const entries = al.forTask(taskId);

    if (entries.length === 0) {
      console.error(`No log entries found for task ${taskId}.`);
      process.exit(1);
    }

    const createEntry = entries.find((e) => e.kind === 'worktree_create');
    const mergeEntry  = entries.find((e) => e.kind === 'worktree_merge');

    if (!createEntry) {
      console.error(`Task ${taskId} has no worktree_create entry — cannot rollback.`);
      process.exit(1);
    }

    if (mergeEntry) {
      // Already merged — revert the merge commit
      const mergeCommit = mergeEntry.payload['mergeCommit'] as string | undefined;
      if (!mergeCommit) {
        console.error(`No merge commit recorded for task ${taskId}.`);
        process.exit(1);
      }
      console.log(`Reverting merge commit ${mergeCommit.slice(0, 8)}…`);
      await execa('git', ['revert', '--no-edit', '-m', '1', mergeCommit], { cwd: repoRoot });
      console.log(`Rollback complete (reverted merge).`);
    } else {
      // Not yet merged — just remove the worktree branch
      const wt = createEntry.payload as { taskId: string; branch: string; path: string; baseRef: string };
      console.log(`Removing worktree branch ${wt.branch}…`);
      await rollbackWorktree(wt, { repoRoot });
      console.log(`Rollback complete (worktree removed).`);
    }

    // Append rollback entry
    al.append({ taskId, kind: 'worktree_rollback', payload: { rolledBack: true } });
  });

program.parse(process.argv);
