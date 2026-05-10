import { readFileSync, watchFile } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { type TaskTag } from "./provider.js";

export interface RouteRule {
  tag: TaskTag;
  provider: string;
  model: string;
  /** Provider name to fall back to if primary circuit-breaker is open. */
  fallback?: string;
  fallbackModel?: string;
}

export interface RoutingConfig {
  routes: RouteRule[];
}

const DEFAULT_CONFIG: RoutingConfig = {
  routes: [
    { tag: "embed", provider: "ollama", model: "nomic-embed-text", fallback: "lmstudio", fallbackModel: "local-embedding" },
    { tag: "summarize", provider: "ollama", model: "llama3.2", fallback: "lmstudio", fallbackModel: "local-model" },
    { tag: "classify", provider: "ollama", model: "llama3.2" },
    { tag: "sanitize", provider: "ollama", model: "llama3.2" },
    { tag: "plan", provider: "anthropic", model: "claude-sonnet-4-6", fallback: "openai", fallbackModel: "gpt-4o" },
    { tag: "code-gen", provider: "anthropic", model: "claude-sonnet-4-6", fallback: "openai", fallbackModel: "gpt-4o" },
  ],
};

function parseConfig(raw: unknown): RoutingConfig {
  if (
    raw &&
    typeof raw === "object" &&
    "routes" in raw &&
    Array.isArray((raw as RoutingConfig).routes)
  ) {
    return raw as RoutingConfig;
  }
  return DEFAULT_CONFIG;
}

export class RoutingEngine {
  private config: RoutingConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? join(process.cwd(), "coderelay.yaml");
    this.config = this.load();
    this.watch();
  }

  private load(): RoutingConfig {
    try {
      const raw = yaml.load(readFileSync(this.configPath, "utf8"));
      return parseConfig(raw);
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  private watch(): void {
    watchFile(this.configPath, { interval: 2000 }, () => {
      this.config = this.load();
    });
  }

  resolve(tag: TaskTag): RouteRule {
    const rule = this.config.routes.find((r) => r.tag === tag);
    if (!rule) throw new Error(`No routing rule for tag: ${tag}`);
    return rule;
  }

  get rules(): RouteRule[] {
    return this.config.routes;
  }
}
