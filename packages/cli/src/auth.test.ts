import { describe, it, expect, vi, afterEach } from 'vitest';
import { saveCredential, loadCredential, clearCredential, listSavedProviders, validateKeyFormat, testCredential } from './auth.js';


describe('auth credential round-trip', () => {
  const passphrase = 'test-pass-123';

  // Clean up any credential we write
  afterEach(() => {
    try { clearCredential('openrouter'); } catch { /* ignore */ }
    try { clearCredential('openai'); } catch { /* ignore */ }
  });

  it('saves and loads a credential correctly', () => {
    saveCredential('openrouter', 'sk-or-test-key', passphrase);
    const loaded = loadCredential('openrouter', passphrase);
    expect(loaded).toBe('sk-or-test-key');
  });

  it('returns null when decrypting with wrong passphrase', () => {
    saveCredential('openai', 'sk-test-key', passphrase);
    const loaded = loadCredential('openai', 'wrong-passphrase');
    expect(loaded).toBeNull();
  });

  it('clearCredential removes the entry', () => {
    saveCredential('openrouter', 'sk-or-test-key', passphrase);
    clearCredential('openrouter');
    const loaded = loadCredential('openrouter', passphrase);
    expect(loaded).toBeNull();
  });

  it('listSavedProviders returns saved providers', () => {
    saveCredential('openrouter', 'sk-or-test-key', passphrase);
    const saved = listSavedProviders();
    expect(saved).toContain('openrouter');
  });
});

describe('validateKeyFormat', () => {
  it('accepts valid anthropic key', () => {
    expect(validateKeyFormat('anthropic', 'sk-ant-api03-abcdefgh')).toBeNull();
  });

  it('rejects anthropic key with wrong prefix', () => {
    expect(validateKeyFormat('anthropic', 'sk-wrongprefix-abc')).toMatch(/sk-ant-/);
  });

  it('accepts valid openai key', () => {
    expect(validateKeyFormat('openai', 'sk-proj-abcdefghij')).toBeNull();
  });

  it('rejects openai key with wrong prefix', () => {
    expect(validateKeyFormat('openai', 'wrong-key-format')).toMatch(/sk-/);
  });

  it('accepts valid gemini key', () => {
    expect(validateKeyFormat('gemini', 'AIzaSyAbcdefghijk')).toBeNull();
  });

  it('rejects gemini key with wrong prefix', () => {
    expect(validateKeyFormat('gemini', 'bad-gemini-key')).toMatch(/AIza/);
  });

  it('accepts valid openrouter key', () => {
    expect(validateKeyFormat('openrouter', 'sk-or-v1-abcdefgh')).toBeNull();
  });

  it('rejects openrouter key with wrong prefix', () => {
    expect(validateKeyFormat('openrouter', 'sk-notrouter-abc')).toMatch(/sk-or-/);
  });

  it('rejects key shorter than 8 chars', () => {
    expect(validateKeyFormat('ollama', 'abc')).toMatch(/short/i);
  });

  it('accepts ollama with any value >=8 chars', () => {
    expect(validateKeyFormat('ollama', 'anything-long-enough')).toBeNull();
  });
});

describe('testCredential', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns ok:false for anthropic 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const result = await testCredential('anthropic', 'sk-ant-bad');
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/401/);
  });

  it('returns ok:true for anthropic 400 (auth ok, bad params)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    const result = await testCredential('anthropic', 'sk-ant-good');
    expect(result.ok).toBe(true);
  });

  it('returns ok:false when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await testCredential('openai', 'sk-bad');
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/ECONNREFUSED/);
  });

  it('returns ok:true for ollama when server responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await testCredential('ollama', '');
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/running/i);
  });
});
