import { describe, it, expect } from "vitest";
import { Router } from "./router.js";
import { withRetry, RetryExhaustedError, CircuitBreaker } from "./retry.js";
import { UsageTracker } from "./usage.js";
import { type LLMProvider, type Message, type CompletionOptions, type TextChunk } from "./provider.js";

function makeProvider(name: string): LLMProvider {
  return {
    name,
    async *complete(_m: Message[], _o: CompletionOptions): AsyncIterable<TextChunk> {
      yield { text: "ok" };
    },
    embed: async (texts: string[]) => texts.map(() => [0.1, 0.2]),
    countTokens: (t: string) => Math.ceil(t.length / 4),
  };
}

describe("Router.resolveTag", () => {
  it("summarize routes to ollama", () => {
    const router = new Router(undefined, ":memory:");
    expect(router.resolveTag("summarize").providerName).toBe("ollama");
    router.shutdown();
  });

  it("code-gen routes to anthropic", () => {
    const router = new Router(undefined, ":memory:");
    expect(router.resolveTag("code-gen").providerName).toBe("anthropic");
    router.shutdown();
  });

  it("embed routes to ollama", () => {
    const router = new Router(undefined, ":memory:");
    expect(router.resolveTag("embed").providerName).toBe("ollama");
    router.shutdown();
  });
});

describe("Router.complete", () => {
  it("streams chunks through registered provider", async () => {
    const router = new Router(undefined, ":memory:");
    router.registerProvider("ollama", (_model) => makeProvider("ollama"));
    const chunks: string[] = [];
    for await (const c of router.complete(
      [{ role: "user", content: "hello" }],
      { tag: "summarize" }
    )) {
      chunks.push(c.text);
    }
    expect(chunks).toContain("ok");
    router.shutdown();
  });
});

describe("withRetry", () => {
  it("retries and eventually succeeds", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 2) throw new Error("fail");
      return "done";
    }, 3, 0);
    expect(result).toBe("done");
    expect(calls).toBe(2);
  });

  it("throws RetryExhaustedError after max attempts", async () => {
    await expect(
      withRetry(async () => { throw new Error("always"); }, 2, 0)
    ).rejects.toBeInstanceOf(RetryExhaustedError);
  });
});

describe("CircuitBreaker", () => {
  it("opens after threshold failures", () => {
    const cb = new CircuitBreaker(2, 60_000);
    expect(cb.isOpen).toBe(false);
    cb.onFailure();
    cb.onFailure();
    expect(cb.isOpen).toBe(true);
  });

  it("resets after success", () => {
    const cb = new CircuitBreaker(1, 60_000);
    cb.onFailure();
    expect(cb.isOpen).toBe(true);
    cb.onSuccess();
    expect(cb.isOpen).toBe(false);
  });
});

describe("UsageTracker", () => {
  it("records and queries today", () => {
    const tracker = new UsageTracker(":memory:");
    tracker.record({
      ts: Date.now(),
      provider: "ollama",
      model: "llama3.2",
      tag: "summarize",
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0,
      latency_ms: 200,
    });
    const rows = tracker.queryToday();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("ollama");
    tracker.close();
  });
});
