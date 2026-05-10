#!/usr/bin/env node
import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";
import { Command } from "commander";
import { UsageTracker } from "@coderelay/router";
import { openGraphDb, IndexPipeline } from "@coderelay/indexer";
import { LongTermMemory } from "@coderelay/memory";
import { runAgent, type AgentName } from "@coderelay/sub-agents";
import { ActionLog, defaultLogPath, rollbackWorktree, createWorktree, removeWorktree } from "@coderelay/governor";
import { execa } from "execa";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { runInit, type InitOptions } from "./init.js";
import { runSetup } from "./setup.js";
import { runAuth } from "./auth.js";
import { runAskSession } from "./ask.js";
import { renderTui } from "./tui/render.js";
import type { TuiStep } from "./tui/types.js";
import { Planner, Retriever, OrchestratorRunner } from "@coderelay/orchestrator";
import { Router } from "@coderelay/router";
import { parseLogFile, DebugAgent, printDiagnosis } from "@coderelay/debugger";
import { runQuality, printQualityReport } from "@coderelay/quality";
import { startDashboard } from "@coderelay/dashboard";
import { TeamStore } from "@coderelay/memory";
import { DaemonServer } from "./daemon.js";
import { writeFile, mkdir } from "node:fs/promises";

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
    const rows = opts.today ? tracker.queryToday() : tracker.queryAll();
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
  .description("Run a prompt via the orchestration loop (Plan→Retrieve→Execute→Verify→Realign)")
  .option("--agent <name>", "Sub-agent to use: claude | gemini", "claude")
  .option("--model <model>", "Override model for the sub-agent")
  .option("--mcp-bin <path>", "Path to MCP server binary (default: auto-detect)")
  .option("--timeout <ms>", "Timeout in milliseconds", "300000")
  .option("--db <path>", "Path to graph.db", ".coderelay/graph.db")
  .option("--budget <tokens>", "Retriever token budget", "8000")
  .option("--tui", "Show live Ink TUI during execution", false)
  .action(async (prompt: string, opts: { agent: string; model?: string; mcpBin?: string; timeout: string; db: string; budget: string; tui: boolean }) => {
    const agent = opts.agent as AgentName;
    if (agent !== 'claude' && agent !== 'gemini') {
      console.error(`Unknown agent: ${agent}. Use 'claude' or 'gemini'.`);
      process.exit(1);
    }

    let router: Router;
    try {
      router = new Router();
    } catch {
      console.error("Router unavailable. Set provider API keys or start Ollama.");
      process.exit(1);
    }

    const llm = async (system: string, user: string): Promise<string> => {
      const chunks: string[] = [];
      for await (const chunk of router.complete([{ role: 'user', content: `${system}\n\n${user}` }], { tag: 'plan' })) {
        chunks.push(chunk.text);
      }
      return chunks.join('');
    };

    let graphDb: ReturnType<typeof openGraphDb> | null = null;
    try { graphDb = openGraphDb(opts.db); } catch { /* no index — ok */ }

    const repoRoot = process.cwd();
    const logPath = defaultLogPath(repoRoot);
    const actionLog = new ActionLog(logPath);

    if (!opts.tui) console.log(`\nCreating worktree sandbox...`);
    const worktree = await createWorktree({ repoRoot });
    if (!opts.tui) console.log(`  Branch: ${worktree.branch}\n`);

    // Set up TUI if requested
    let tuiHandle: ReturnType<typeof renderTui> | null = null;
    const tuiSteps: TuiStep[] = [];
    let tokenSpend = 0;

    if (opts.tui) {
      tuiHandle = renderTui({ steps: tuiSteps, currentStep: 0, tokenSpend: 0, recentActions: ['Planning...'] });
    }

    try {
      const runner = new OrchestratorRunner({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        graphDb: (graphDb ?? { prepare: () => ({ all: () => [] }) }) as any,
        vector: null,
        llm,
        log: actionLog,
        worktree,
        retrieverBudget: parseInt(opts.budget, 10) || 8000,
        agentName: agent,
        timeoutMs: parseInt(opts.timeout, 10) || 300_000,
        ...(opts.mcpBin !== undefined ? { mcpServerBinPath: opts.mcpBin } : {}),
        ...(tuiHandle !== null ? {
          onProgress: (evt: import('@coderelay/orchestrator').OrchestratorProgressEvent) => {
            const idx = tuiSteps.findIndex((s) => s.step === evt.stepNum);
            const tuiStep: TuiStep = { step: evt.stepNum, intent: evt.intent, status: evt.status };
            if (idx >= 0) { tuiSteps[idx] = tuiStep; } else { tuiSteps.push(tuiStep); }
            tokenSpend += evt.tokensUsed ?? 0;
            tuiHandle!.update({
              steps: [...tuiSteps],
              currentStep: evt.status === 'running' ? evt.stepNum : 0,
              tokenSpend,
              recentActions: [`Step ${evt.stepNum}: ${evt.intent} [${evt.status}]`],
            });
          },
        } : {}),
      });

      const result = await runner.run(prompt);

      if (tuiHandle !== null) {
        tuiHandle.update({ steps: tuiSteps.map((s) => ({ ...s, status: 'done' as const })), recentActions: [`Done — ${result.steps.length} steps`] });
        await new Promise<void>((r) => setTimeout(r, 1500));
        tuiHandle.clear();
      }

      console.log(`\nTask ${result.taskId.slice(0, 8)} complete.`);
      console.log(`  Steps : ${result.steps.length}`);
      console.log(`  Facts written : ${result.factsWritten}`);
      console.log(`  Drift detected : ${result.driftDetected}`);
      const passed = result.verifications.filter((v) => v.passed).length;
      console.log(`  Verifications : ${passed}/${result.verifications.length} passed\n`);
    } catch (err) {
      tuiHandle?.clear();
      throw err;
    } finally {
      graphDb?.close();
      await removeWorktree(worktree, { repoRoot }).catch(() => { /* best-effort */ });
    }
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

// --- init ---
program
  .command("init")
  .description("Initialize coderelay.yaml for this project (auto-detects project type)")
  .option("--force", "Overwrite existing coderelay.yaml", false)
  .option("--dir <path>", "Target directory (default: cwd)")
  .action((opts: { force: boolean; dir?: string }) => {
    const initOpts: InitOptions = { force: opts.force };
    if (opts.dir !== undefined) initOpts.dir = opts.dir;
    runInit(initOpts);
  });

// --- plan (8.2) ---
program
  .command("plan <task>")
  .description("Generate and display an execution plan without running it")
  .option("--db <path>", "Path to graph.db", ".coderelay/graph.db")
  .option("--max-steps <n>", "Max plan steps", "6")
  .action(async (task: string, opts: { db: string; maxSteps: string }) => {
    const maxSteps = Math.max(1, parseInt(opts.maxSteps, 10) || 6);

    // Build a repo summary from graph stats
    let repoSummary = "Repository (no index found — run `coderelay index .` first)";
    try {
      const db = openGraphDb(opts.db);
      const nf = (t: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
      const files = nf("files");
      const syms = nf("symbols");
      db.close();
      repoSummary = `Indexed repository: ${files} files, ${syms} symbols.`;
    } catch { /* no index */ }

    // Use router for LLM call if available, otherwise show note
    let planner: Planner;
    try {
      const router = new Router();
      const llm = async (system: string, user: string): Promise<string> => {
        const chunks: string[] = [];
        for await (const chunk of router.complete([
          { role: "user", content: `${system}\n\n${user}` },
        ], { tag: "plan" })) {
          chunks.push(chunk.text);
        }
        return chunks.join("");
      };
      planner = new Planner(llm);
    } catch {
      console.error("Router unavailable. Set provider API keys or start Ollama.");
      process.exit(1);
    }

    console.log(`\nPlanning: "${task}"\n`);
    const result = await planner.plan({ task, repoSummary, maxSteps });
    for (const s of result.steps) {
      console.log(`  ${s.step}. ${s.intent}`);
      if (s.expectedFiles.length > 0) console.log(`     Files : ${s.expectedFiles.join(", ")}`);
      if (s.toolsNeeded.length > 0) console.log(`     Tools : ${s.toolsNeeded.join(", ")}`);
    }
    console.log();
  });

// --- status (8.2) ---
program
  .command("status")
  .description("Show orchestrator status: recent actions and last task outcome")
  .option("--task <taskId>", "Filter by specific task ID")
  .option("--log-path <path>", "Path to action.log")
  .action((opts: { task?: string; logPath?: string }) => {
    const logPath = opts.logPath ?? defaultLogPath(process.cwd());
    const al = new ActionLog(logPath);
    const entries = opts.task ? al.forTask(opts.task) : al.readAll().slice(-20);

    console.log("\nCodeRelay Status\n");

    if (entries.length === 0) {
      console.log("  No recent activity.");
      return;
    }

    const tasks = new Map<string, number>();
    for (const e of entries) {
      tasks.set(e.taskId, (tasks.get(e.taskId) ?? 0) + 1);
    }

    console.log(`  Active tasks: ${tasks.size}`);
    console.log(`  Total actions: ${entries.length}`);
    console.log();

    const recent = entries.slice(-5);
    console.log("  Recent actions:");
    for (const e of recent) {
      const date = new Date(e.ts).toISOString().slice(11, 19);
      console.log(`    ${date}  ${e.kind.padEnd(18)} [${e.taskId.slice(0, 8)}]`);
    }
    console.log();
  });

// --- cost (8.2) ---
program
  .command("cost")
  .description("Detailed token cost breakdown by provider and model")
  .option("--today", "Show only today's data", false)
  .option("--provider <name>", "Filter by provider name")
  .action((opts: { today: boolean; provider?: string }) => {
    const tracker = new UsageTracker();
    let rows = tracker.queryToday();
    tracker.close();

    if (opts.provider !== undefined) {
      rows = rows.filter((r) => r.provider === opts.provider);
    }

    if (rows.length === 0) {
      console.log("No cost data found.");
      return;
    }

    const byProvider = new Map<string, { tokIn: number; tokOut: number; cost: number }>();
    for (const r of rows) {
      const key = `${r.provider}/${r.model}`;
      const prev = byProvider.get(key) ?? { tokIn: 0, tokOut: 0, cost: 0 };
      byProvider.set(key, {
        tokIn: prev.tokIn + r.tokens_in,
        tokOut: prev.tokOut + r.tokens_out,
        cost: prev.cost + r.cost_usd,
      });
    }

    console.log("\nCost Breakdown" + (opts.today ? " — Today" : "") + "\n");
    console.log("  Provider/Model".padEnd(40) + "TokIn".padStart(10) + "TokOut".padStart(10) + "Cost$".padStart(12));
    console.log("  " + "─".repeat(68));
    for (const [key, v] of byProvider) {
      console.log(
        `  ${key.padEnd(38)}  ${String(v.tokIn).padStart(9)}  ${String(v.tokOut).padStart(9)}  $${v.cost.toFixed(6).padStart(10)}`
      );
    }

    const totIn = rows.reduce((n, r) => n + r.tokens_in, 0);
    const totOut = rows.reduce((n, r) => n + r.tokens_out, 0);
    const totCost = rows.reduce((n, r) => n + r.cost_usd, 0);
    console.log("  " + "─".repeat(68));
    console.log(`  ${"TOTAL".padEnd(38)}  ${String(totIn).padStart(9)}  ${String(totOut).padStart(9)}  $${totCost.toFixed(6).padStart(10)}`);
    console.log();
  });

// --- context (8.2) ---
program
  .command("context <query>")
  .description("Show context chunks that would be retrieved for a query")
  .option("--db <path>", "Path to graph.db", ".coderelay/graph.db")
  .option("--budget <tokens>", "Token budget", "8000")
  .option("-n, --limit <n>", "Max chunks", "10")
  .action(async (query: string, opts: { db: string; budget: string; limit: string }) => {
    const budget = parseInt(opts.budget, 10) || 8000;

    let db: ReturnType<typeof openGraphDb>;
    try {
      db = openGraphDb(opts.db);
    } catch {
      console.error(`Cannot open graph db at ${opts.db}. Run \`coderelay index .\` first.`);
      process.exit(1);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retriever = new Retriever(db as any, null, { tokenBudget: budget });
    const manifest = await retriever.retrieve({
      step: 1,
      intent: query,
      expectedFiles: [],
      toolsNeeded: [],
    });

    db.close();

    console.log(`\nContext for: "${query}"`);
    console.log(`Budget: ${budget} tokens — retrieved: ${manifest.totalTokens} tokens in ${manifest.chunks.length} chunks\n`);

    const limit = parseInt(opts.limit, 10) || 10;
    for (const [i, c] of manifest.chunks.slice(0, limit).entries()) {
      const preview = c.content.slice(0, 120).replace(/\n/g, " ").trim();
      console.log(`  [${i + 1}] ${c.filePath} (${c.tokens} tok, ${c.source})`);
      console.log(`      ${preview}`);
      console.log();
    }
  });

// --- explain (8.2) ---
program
  .command("explain <query>")
  .description("Explain why specific context would be retrieved for a query")
  .option("--db <path>", "Path to graph.db", ".coderelay/graph.db")
  .option("--budget <tokens>", "Token budget", "8000")
  .action(async (query: string, opts: { db: string; budget: string }) => {
    const budget = parseInt(opts.budget, 10) || 8000;

    let db: ReturnType<typeof openGraphDb>;
    try {
      db = openGraphDb(opts.db);
    } catch {
      console.error(`Cannot open graph db at ${opts.db}. Run \`coderelay index .\` first.`);
      process.exit(1);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retriever = new Retriever(db as any, null, { tokenBudget: budget });
    const manifest = await retriever.retrieve({
      step: 1,
      intent: query,
      expectedFiles: [],
      toolsNeeded: [],
    });

    db.close();

    console.log(`\nRetrieval explanation for: "${query}"\n`);
    console.log(`Strategy: hybrid (graph neighborhood + vector semantic search)`);
    console.log(`  Graph chunks: ${manifest.chunks.filter((c) => c.source === 'graph').length}`);
    console.log(`  Vector chunks: ${manifest.chunks.filter((c) => c.source === 'vector').length}`);
    console.log(`  Total tokens used: ${manifest.totalTokens} / ${budget}\n`);

    if (manifest.chunks.length === 0) {
      console.log(`  No chunks retrieved. The index may be empty or the query has no matching symbols.`);
      console.log(`  Tip: run \`coderelay index .\` then try again.\n`);
      return;
    }

    console.log(`  Why these chunks?`);
    console.log(`  - Graph chunks: pulled from SQLite by matching filePath patterns to query terms.`);
    console.log(`  - Vector chunks: semantic similarity search against chunk embeddings.`);
    console.log(`  - Deduplication: identical content fingerprints removed.`);
    console.log(`  - Budget enforcement: greedy fill up to ${budget} tokens.\n`);
  });

// --- run (TUI-enhanced) ---
// Override the existing run command to support --tui flag
// (existing run command above, add --tui variant below)
program
  .command("run-tui <prompt>")
  .description("Run a prompt with live TUI display (plan + step progress + token spend)")
  .option("--agent <name>", "Sub-agent: claude | gemini", "claude")
  .option("--db <path>", "Path to graph.db", ".coderelay/graph.db")
  .action(async (prompt: string, opts: { agent: string; db: string }) => {
    const agent = opts.agent as AgentName;
    if (agent !== 'claude' && agent !== 'gemini') {
      console.error(`Unknown agent: ${agent}. Use 'claude' or 'gemini'.`);
      process.exit(1);
    }

    // Build a quick plan for TUI display
    let steps: TuiStep[] = [{ step: 1, intent: prompt.slice(0, 60), status: 'running' }];

    const tui = renderTui({
      steps,
      currentStep: 1,
      tokenSpend: 0,
      recentActions: [`Starting ${agent} agent...`],
    });

    try {
      const runOpts = { agent, prompt } as Parameters<typeof runAgent>[0];
      const output = await runAgent(runOpts);

      steps = steps.map((s) => ({ ...s, status: 'done' as const }));
      tui.update({ steps, recentActions: [`Done. ${output.slice(0, 80)}`] });
    } catch (err) {
      steps = steps.map((s) => ({ ...s, status: 'failed' as const }));
      tui.update({ steps, recentActions: [`Error: ${String(err).slice(0, 80)}`] });
    }

    await new Promise<void>((r) => setTimeout(r, 1500));
    tui.clear();
  });

// --- debug ---
program
  .command("debug <log-file>")
  .description("Analyze a log file or stack trace and suggest root cause fixes")
  .option("--no-llm", "Parse only, skip LLM diagnosis")
  .action(async (logFile: string, opts: { llm: boolean }) => {
    let entries;
    try {
      entries = await parseLogFile(logFile);
    } catch (err) {
      console.error(`Cannot read log file: ${String(err)}`);
      process.exit(1);
    }

    if (entries.length === 0) {
      console.log("No log entries found.");
      return;
    }

    const errCount = entries.filter(e => e.level === 'error').length;
    const warnCount = entries.filter(e => e.level === 'warn').length;
    console.log(`\nParsed ${entries.length} entries (${errCount} errors, ${warnCount} warnings)\n`);

    if (!opts.llm) {
      for (const e of entries.filter(e => e.level === 'error').slice(0, 5)) {
        console.log(`  [ERROR] ${e.message}`);
        if (e.stack) {
          for (const f of e.stack.slice(0, 3)) console.log(`    ${f.raw}`);
        }
      }
      return;
    }

    let router: Router;
    try {
      router = new Router();
    } catch {
      console.error("Router unavailable. Set provider API keys.");
      process.exit(1);
    }

    const agent = new DebugAgent(router);
    try {
      const diagnosis = await agent.diagnose(entries);
      printDiagnosis(diagnosis);
    } catch (err) {
      console.error(`Diagnosis failed: ${String(err)}`);
      process.exit(1);
    }
  });

// --- quality ---
program
  .command("quality [path]")
  .description("Run design-quality checks: complexity, duplication, SOLID")
  .option("--max-complexity <n>", "Max cyclomatic complexity threshold", "15")
  .option("--max-duplication <rate>", "Max duplicate line rate (0-1)", "0.15")
  .option("--min-solid <score>", "Min SOLID score (0-100)", "60")
  .action(async (targetPath: string | undefined, opts: { maxComplexity: string; maxDuplication: string; minSolid: string }) => {
    const dir = resolve(targetPath ?? ".");
    const thresholds = {
      maxComplexity: parseInt(opts.maxComplexity, 10) || 15,
      maxDuplicateRate: parseFloat(opts.maxDuplication) || 0.15,
      minSolidScore: parseInt(opts.minSolid, 10) || 60,
    };

    console.log(`\nQuality check: ${dir}\n`);
    try {
      const result = await runQuality(dir, thresholds);
      printQualityReport(result);
      if (!result.passed) process.exit(1);
    } catch (err) {
      console.error(`Quality check failed: ${String(err)}`);
      process.exit(1);
    }
  });

// --- dashboard ---
program
  .command("dashboard")
  .description("Start the web dashboard for project knowledge graph and memory")
  .option("--port <n>", "HTTP port", "4242")
  .option("--graph-db <path>", "Path to graph.db", ".coderelay/graph.db")
  .option("--longterm-db <path>", "Path to longterm.db", ".coderelay/longterm.db")
  .option("--session-db <path>", "Path to session.db", ".coderelay/session.db")
  .option("--log-path <path>", "Path to action.log")
  .action(async (opts: { port: string; graphDb: string; longtermDb: string; sessionDb: string; logPath?: string }) => {
    const port = parseInt(opts.port, 10) || 4242;
    const logPath = opts.logPath ?? defaultLogPath(process.cwd());

    console.log(`\nStarting CodeRelay dashboard on http://localhost:${port}\n`);
    await startDashboard({
      port,
      graphDbPath: opts.graphDb,
      ltDbPath: opts.longtermDb,
      sessionDbPath: opts.sessionDb,
      actionLogPath: logPath,
    });
  });

// --- daemon ---
program
  .command("daemon")
  .description("Start the local CodeRelay daemon (IPC server for VSCode extension)")
  .action(() => {
    const server = new DaemonServer();
    server.start();
    console.log("CodeRelay daemon started. Press Ctrl+C to stop.");
    process.on('SIGINT', () => { server.stop(); process.exit(0); });
    process.on('SIGTERM', () => { server.stop(); process.exit(0); });
  });

// --- team ---
const teamCmd = program
  .command("team")
  .description("Team mode: shared encrypted memory across developers");

teamCmd
  .command("init")
  .description("Initialize team mode — writes .coderelay/team.json config")
  .requiredOption("--shared-db <path>", "Path to shared encrypted SQLite database")
  .option("--passphrase <secret>", "Encryption passphrase (or set CODERELAY_TEAM_PASSPHRASE)")
  .option("--author <name>", "Your author name", process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown')
  .action(async (opts: { sharedDb: string; passphrase?: string; author: string }) => {
    const passphrase = opts.passphrase ?? process.env['CODERELAY_TEAM_PASSPHRASE'];
    if (!passphrase) {
      console.error("Passphrase required: --passphrase or CODERELAY_TEAM_PASSPHRASE env var.");
      process.exit(1);
    }

    const configDir = resolve(".coderelay");
    await mkdir(configDir, { recursive: true });

    const config = { sharedDb: opts.sharedDb, author: opts.author };
    await writeFile(resolve(".coderelay/team.json"), JSON.stringify(config, null, 2), "utf8");
    console.log(`Team mode initialized.\n  Shared DB : ${opts.sharedDb}\n  Author    : ${opts.author}`);
    console.log(`  Config    : .coderelay/team.json`);

    // Verify DB is accessible with this passphrase
    try {
      const store = new TeamStore(opts.sharedDb, passphrase, opts.author);
      const facts = store.readAll();
      store.close();
      console.log(`  DB check  : OK (${facts.length} existing facts)`);
    } catch (err) {
      console.error(`  DB check  : FAILED — ${String(err)}`);
      process.exit(1);
    }
  });

teamCmd
  .command("status")
  .description("Show team sync status and recent shared facts")
  .option("--passphrase <secret>", "Encryption passphrase (or set CODERELAY_TEAM_PASSPHRASE)")
  .option("-n, --limit <n>", "Max facts to show", "10")
  .action(async (opts: { passphrase?: string; limit: string }) => {
    const passphrase = opts.passphrase ?? process.env['CODERELAY_TEAM_PASSPHRASE'];
    if (!passphrase) {
      console.error("Passphrase required: --passphrase or CODERELAY_TEAM_PASSPHRASE env var.");
      process.exit(1);
    }

    let config: { sharedDb: string; author: string };
    try {
      const raw = await readFile(resolve(".coderelay/team.json"), "utf8");
      config = JSON.parse(raw) as { sharedDb: string; author: string };
    } catch {
      console.error("Team mode not initialized. Run: coderelay team init --shared-db <path>");
      process.exit(1);
    }

    try {
      const store = new TeamStore(config.sharedDb, passphrase, config.author);
      const facts = store.readAll();
      store.close();

      const limit = parseInt(opts.limit, 10) || 10;
      console.log(`\nTeam Status\n  Shared DB : ${config.sharedDb}\n  Author    : ${config.author}`);
      console.log(`  Facts     : ${facts.length} total\n`);

      if (facts.length === 0) {
        console.log("  No shared facts yet.");
        return;
      }

      console.log(`  Recent facts (last ${Math.min(limit, facts.length)}):`);
      for (const f of facts.slice(-limit)) {
        const date = new Date(f.createdAt).toISOString().slice(0, 16).replace('T', ' ');
        console.log(`    [${date}] [${f.author}] ${f.content.slice(0, 80)}`);
      }
      console.log();
    } catch (err) {
      console.error(`Failed to read team store: ${String(err)}`);
      process.exit(1);
    }
  });

// --- setup ---
program
  .command("setup")
  .description("Check prerequisites (Node, pnpm, git, claude CLI, gemini CLI, ollama)")
  .action(async () => {
    await runSetup();
  });

// --- auth ---
program
  .command("auth")
  .description("Manage encrypted API credentials (save / load / clear)")
  .action(async () => {
    await runAuth();
  });

// --- ask ---
program
  .command("ask")
  .description("Interactive orchestrator REPL — type tasks, get results, type 'exit' to quit")
  .option("--agent <name>", "Sub-agent to use: claude | gemini", "claude")
  .option("--db <path>", "Path to graph.db", ".coderelay/graph.db")
  .option("--budget <tokens>", "Retriever token budget", "8000")
  .option("--timeout <ms>", "Timeout in ms", "300000")
  .option("--auto-merge", "Auto-merge worktree on task success", false)
  .action(async (opts: { agent: string; db: string; budget: string; timeout: string; autoMerge: boolean }) => {
    const agent = opts.agent as AgentName;

    let router: Router;
    try {
      router = new Router();
    } catch {
      console.error("Router unavailable. Set provider API keys or start Ollama.");
      process.exit(1);
    }

    const llm = async (system: string, user: string): Promise<string> => {
      const chunks: string[] = [];
      for await (const chunk of router.complete([{ role: 'user', content: `${system}\n\n${user}` }], { tag: 'plan' })) {
        chunks.push(chunk.text);
      }
      return chunks.join('');
    };

    let graphDb: ReturnType<typeof openGraphDb> | null = null;
    try { graphDb = openGraphDb(opts.db); } catch { /* no index — ok */ }

    const repoRoot = process.cwd();
    const actionLog = new ActionLog(defaultLogPath(repoRoot));
    const worktree = await createWorktree({ repoRoot });

    try {
      await runAskSession({
        orchestratorOpts: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          graphDb: (graphDb ?? { prepare: () => ({ all: () => [] }) }) as any,
          vector: null,
          llm,
          log: actionLog,
          worktree,
          retrieverBudget: parseInt(opts.budget, 10) || 8000,
          agentName: agent,
          timeoutMs: parseInt(opts.timeout, 10) || 300_000,
        },
        autoMerge: opts.autoMerge,
      });
    } finally {
      graphDb?.close();
      await removeWorktree(worktree, { repoRoot }).catch(() => { /* best-effort */ });
    }
  });

program.parse(process.argv);
