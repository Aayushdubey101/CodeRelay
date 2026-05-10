import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('OpenRouterProvider', () => {
  const origEnv = process.env['OPENROUTER_API_KEY'];

  beforeEach(() => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-test-key';
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env['OPENROUTER_API_KEY'];
    else process.env['OPENROUTER_API_KEY'] = origEnv;
    vi.restoreAllMocks();
  });

  it('throws on construction when OPENROUTER_API_KEY is missing', async () => {
    delete process.env['OPENROUTER_API_KEY'];
    const { OpenRouterProvider } = await import('./openrouter.js');
    expect(() => new OpenRouterProvider()).toThrow('OPENROUTER_API_KEY');
  });

  it('countTokens estimates 1 token per 4 chars', async () => {
    const { OpenRouterProvider } = await import('./openrouter.js');
    const p = new OpenRouterProvider();
    expect(p.countTokens('1234')).toBe(1);
    expect(p.countTokens('12345678')).toBe(2);
    expect(p.countTokens('')).toBe(0);
  });

  it('embed throws unsupported error', async () => {
    const { OpenRouterProvider } = await import('./openrouter.js');
    const p = new OpenRouterProvider();
    await expect(p.embed(['hello'])).rejects.toThrow('does not support embeddings');
  });
});
