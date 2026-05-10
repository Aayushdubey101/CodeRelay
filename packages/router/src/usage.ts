import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { type TaskTag } from "./provider.js";

export interface UsageEntry {
  ts: number;
  provider: string;
  model: string;
  tag: TaskTag;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
}

const COST_TABLE: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3 / 1e6, out: 15 / 1e6 },
  "claude-opus-4-7": { in: 15 / 1e6, out: 75 / 1e6 },
  "claude-haiku-4-5-20251001": { in: 0.25 / 1e6, out: 1.25 / 1e6 },
  "gpt-4o": { in: 5 / 1e6, out: 15 / 1e6 },
  "gemini-1.5-flash": { in: 0.075 / 1e6, out: 0.3 / 1e6 },
};

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const rates = COST_TABLE[model] ?? { in: 0, out: 0 };
  return rates.in * tokensIn + rates.out * tokensOut;
}

export class UsageTracker {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? join(process.cwd(), ".coderelay", "usage.db");
    if (path !== ":memory:") {
      mkdirSync(join(path, ".."), { recursive: true });
    }
    this.db = new Database(path);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        tag TEXT NOT NULL,
        tokens_in INTEGER NOT NULL,
        tokens_out INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        latency_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage(ts);
    `);
  }

  record(entry: UsageEntry): void {
    this.db
      .prepare(
        `INSERT INTO usage (ts,provider,model,tag,tokens_in,tokens_out,cost_usd,latency_ms)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        entry.ts,
        entry.provider,
        entry.model,
        entry.tag,
        entry.tokens_in,
        entry.tokens_out,
        entry.cost_usd,
        entry.latency_ms
      );
  }

  queryToday(): UsageEntry[] {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.db
      .prepare(`SELECT * FROM usage WHERE ts >= ? ORDER BY ts DESC`)
      .all(startOfDay.getTime()) as UsageEntry[];
  }

  queryAll(): UsageEntry[] {
    return this.db
      .prepare(`SELECT * FROM usage ORDER BY ts DESC`)
      .all() as UsageEntry[];
  }

  queryRange(fromTs: number, toTs: number): UsageEntry[] {
    return this.db
      .prepare(`SELECT * FROM usage WHERE ts >= ? AND ts <= ? ORDER BY ts DESC`)
      .all(fromTs, toTs) as UsageEntry[];
  }

  close(): void {
    this.db.close();
  }
}
