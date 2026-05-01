import { type LLMProvider, type Message, type CompletionOptions, type TextChunk, type TaskTag, type EmbedOptions } from "./provider.js";
import { RoutingEngine, type RouteRule } from "./routing.js";
import { CircuitBreaker, withRetry } from "./retry.js";
import { UsageTracker, estimateCost } from "./usage.js";
import { createLogger } from "@coderelay/core";

const log = createLogger("@coderelay/router");

type ProviderFactory = (model: string) => LLMProvider;

/** Collect all chunks from an async iterable into a single string. */
async function collectText(iter: AsyncIterable<TextChunk>): Promise<string> {
  let out = "";
  for await (const c of iter) out += c.text;
  return out;
}

export class Router {
  private engines = new Map<string, RoutingEngine>();
  private breakers = new Map<string, CircuitBreaker>();
  private usage: UsageTracker;
  private factories = new Map<string, ProviderFactory>();
  private providerCache = new Map<string, LLMProvider>();
  private routing: RoutingEngine;

  constructor(configPath?: string, usageDbPath?: string) {
    this.routing = new RoutingEngine(configPath);
    this.usage = new UsageTracker(usageDbPath);
  }

  /** Register a factory function for a named provider. */
  registerProvider(name: string, factory: ProviderFactory): void {
    this.factories.set(name, factory);
  }

  private getProvider(name: string, model: string): LLMProvider {
    const key = `${name}:${model}`;
    if (this.providerCache.has(key)) return this.providerCache.get(key)!;
    const factory = this.factories.get(name);
    if (!factory) throw new Error(`No provider registered: ${name}`);
    const p = factory(model);
    this.providerCache.set(key, p);
    return p;
  }

  private getBreaker(providerName: string): CircuitBreaker {
    if (!this.breakers.has(providerName)) {
      this.breakers.set(providerName, new CircuitBreaker());
    }
    return this.breakers.get(providerName)!;
  }

  private pickProvider(tag: TaskTag): { provider: LLMProvider; rule: RouteRule } {
    const rule = this.routing.resolve(tag);
    const breaker = this.getBreaker(rule.provider);

    if (!breaker.isOpen) {
      try {
        return { provider: this.getProvider(rule.provider, rule.model), rule };
      } catch (err) {
        log.warn({ err, provider: rule.provider }, "Primary provider unavailable, trying fallback");
      }
    }

    if (rule.fallback && rule.fallbackModel) {
      return {
        provider: this.getProvider(rule.fallback, rule.fallbackModel),
        rule: { ...rule, provider: rule.fallback, model: rule.fallbackModel },
      };
    }
    throw new Error(`Provider ${rule.provider} circuit is open and no fallback configured for tag: ${tag}`);
  }

  async *complete(
    messages: Message[],
    opts: CompletionOptions
  ): AsyncIterable<TextChunk> {
    const { provider, rule } = this.pickProvider(opts.tag);
    const breaker = this.getBreaker(rule.provider);
    const start = Date.now();
    const tokensIn = messages.reduce((n, m) => n + provider.countTokens(m.content), 0);

    let text = "";
    try {
      const chunks: TextChunk[] = [];
      const iter = await withRetry(async () => {
        const it = provider.complete(messages, opts);
        return it;
      });
      for await (const chunk of iter) {
        chunks.push(chunk);
        yield chunk;
      }
      text = chunks.map((c) => c.text).join("");
      breaker.onSuccess();
    } catch (err) {
      breaker.onFailure();
      throw err;
    } finally {
      const tokensOut = provider.countTokens(text);
      this.usage.record({
        ts: Date.now(),
        provider: rule.provider,
        model: rule.model,
        tag: opts.tag,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: estimateCost(rule.model, tokensIn, tokensOut),
        latency_ms: Date.now() - start,
      });
    }
  }

  async embed(texts: string[], tag: TaskTag = "embed", opts?: EmbedOptions): Promise<number[][]> {
    const { provider, rule } = this.pickProvider(tag);
    const breaker = this.getBreaker(rule.provider);
    const start = Date.now();
    try {
      const result = await withRetry(() => provider.embed(texts, opts));
      breaker.onSuccess();
      this.usage.record({
        ts: Date.now(),
        provider: rule.provider,
        model: rule.model,
        tag,
        tokens_in: texts.reduce((n, t) => n + provider.countTokens(t), 0),
        tokens_out: 0,
        cost_usd: 0,
        latency_ms: Date.now() - start,
      });
      return result;
    } catch (err) {
      breaker.onFailure();
      throw err;
    }
  }

  /** Convenience: get the provider resolved for a given tag (for type-check / tests). */
  resolveTag(tag: TaskTag): { providerName: string; model: string } {
    const rule = this.routing.resolve(tag);
    return { providerName: rule.provider, model: rule.model };
  }

  get usageTracker(): UsageTracker {
    return this.usage;
  }

  shutdown(): void {
    this.usage.close();
  }
}
