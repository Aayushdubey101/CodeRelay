#!/usr/bin/env node
import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";
import { Command } from "commander";
import { UsageTracker } from "@coderelay/router";
import { openGraphDb } from "@coderelay/indexer";

export const log: Logger = createLogger("@coderelay/cli");

const program = new Command();

program
  .name("coderelay")
  .description("CLI orchestrator wrapping coding agents with shared graph, memory, and governance")
  .version("0.0.0");

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
      "Provider".padEnd(12) +
        "Model".padEnd(30) +
        "Tag".padEnd(12) +
        "TokIn".padStart(8) +
        "TokOut".padStart(8) +
        "Cost$".padStart(10)
    );
    console.log("─".repeat(80));

    for (const r of rows) {
      const ts = new Date(r.ts).toISOString().slice(11, 19);
      console.log(
        r.provider.padEnd(12) +
          r.model.padEnd(30) +
          r.tag.padEnd(12) +
          String(r.tokens_in).padStart(8) +
          String(r.tokens_out).padStart(8) +
          ("$" + r.cost_usd.toFixed(6)).padStart(10)
      );
    }

    console.log("─".repeat(80));
    console.log(
      "TOTAL".padEnd(54) +
        String(totalTokensIn).padStart(8) +
        String(totalTokensOut).padStart(8) +
        ("$" + totalCost.toFixed(6)).padStart(10)
    );
    console.log();
  });

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

program.parse(process.argv);
