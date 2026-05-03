import { describe, it, expect } from 'vitest';
import { EgressFilter, hostnameFromUrl } from '../egress.js';

describe('EgressFilter — empty config (allow all)', () => {
  const f = new EgressFilter();

  it('allows any domain when no lists configured', () => {
    expect(f.check('api.github.com').allowed).toBe(true);
    expect(f.check('evil.com').allowed).toBe(true);
  });
});

describe('EgressFilter — allow list', () => {
  const f = new EgressFilter({ allowDomains: ['api.openai.com', '*.anthropic.com', 'registry.npmjs.org'] });

  it('allows exact domain match', () => {
    expect(f.check('api.openai.com').allowed).toBe(true);
    expect(f.check('registry.npmjs.org').allowed).toBe(true);
  });

  it('allows subdomain wildcard match', () => {
    expect(f.check('api.anthropic.com').allowed).toBe(true);
    expect(f.check('claude.anthropic.com').allowed).toBe(true);
  });

  it('blocks root domain when only wildcard listed', () => {
    // *.anthropic.com does NOT match anthropic.com
    expect(f.check('anthropic.com').allowed).toBe(false);
  });

  it('blocks domain not in allow list', () => {
    const r = f.check('evil.com');
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('allow list');
  });
});

describe('EgressFilter — deny list overrides allow', () => {
  const f = new EgressFilter({
    allowDomains: ['*.github.com'],
    denyDomains: ['evil.github.com'],
  });

  it('allows normal subdomain', () => {
    expect(f.check('api.github.com').allowed).toBe(true);
  });

  it('deny list blocks even if domain is in allow list', () => {
    const r = f.check('evil.github.com');
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('deny list');
  });
});

describe('EgressFilter — URL normalization', () => {
  const f = new EgressFilter({ allowDomains: ['api.github.com'] });

  it('strips protocol prefix', () => {
    expect(f.check('https://api.github.com').allowed).toBe(true);
    expect(f.check('http://api.github.com').allowed).toBe(true);
  });

  it('strips path and port from domain', () => {
    expect(f.check('api.github.com:443').allowed).toBe(true);
  });
});

describe('EgressFilter — fetch wrapper throws on blocked domain', () => {
  const f = new EgressFilter({ allowDomains: ['api.openai.com'] });

  it('throws for blocked domain', async () => {
    await expect(f.fetch('https://evil.com/data')).rejects.toThrow('EgressFilter: blocked');
  });
});

describe('hostnameFromUrl', () => {
  it('extracts hostname', () => {
    expect(hostnameFromUrl('https://api.github.com/repos')).toBe('api.github.com');
    expect(hostnameFromUrl('http://localhost:3000/path')).toBe('localhost');
  });

  it('returns empty string for invalid URL', () => {
    expect(hostnameFromUrl('not-a-url')).toBe('');
    expect(hostnameFromUrl('')).toBe('');
  });
});
