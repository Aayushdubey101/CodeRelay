import { describe, it, expect, vi, afterEach } from "vitest";
import { LMStudioProvider } from "./lmstudio.js";

describe("LMStudioProvider.healthCheck", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns ok:false when server not running", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await LMStudioProvider.healthCheck("localhost:1234");
    expect(result.ok).toBe(false);
    expect(result.models).toEqual([]);
  });

  it("returns ok:true with model list when running", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "llama-3.2" }, { id: "mistral-7b" }] }),
    }));
    const result = await LMStudioProvider.healthCheck("localhost:1234");
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["llama-3.2", "mistral-7b"]);
  });

  it("returns ok:false when HTTP response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await LMStudioProvider.healthCheck("localhost:1234");
    expect(result.ok).toBe(false);
    expect(result.models).toEqual([]);
  });
});

describe("LMStudioProvider constructor", () => {
  it("uses custom host in baseURL", () => {
    const p = new LMStudioProvider("local-model", "local-embed", "myhost:5678");
    expect(p.baseUrl).toBe("http://myhost:5678/v1");
  });

  it("defaults to localhost:1234", () => {
    const p = new LMStudioProvider();
    expect(p.baseUrl).toBe("http://localhost:1234/v1");
  });

  it("routes request using OpenAI SDK with custom baseURL", () => {
    const p = new LMStudioProvider("my-model", "my-embed", "localhost:1234");
    expect(p.name).toBe("lmstudio");
    expect(p.model).toBe("my-model");
    expect(p.baseUrl).toContain("localhost:1234");
  });
});
