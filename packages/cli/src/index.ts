#!/usr/bin/env node
import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";
import { Command } from "commander";
import { UsageTracker } from "@coderelay/router";
import { openGraphDb, IndexPipeline } from "@coderelay/indexer";
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

program.parse(process.argv);
