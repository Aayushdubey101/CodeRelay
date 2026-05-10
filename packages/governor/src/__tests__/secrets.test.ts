import { describe, it, expect } from 'vitest';
import { scanSecrets, hasSecrets } from '../secrets.js';

describe('scanSecrets — detected', () => {
  it.each([
    // AWS — valid 20-char format: AKIA + 16 uppercase alphanum
    ['AKIAIOSFODNN7EXAMPLE', 'aws-access-key-id'],
    ['ABIAIOSFODNN7EXAMPLE', 'aws-access-key-id'],
    ['aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'aws-secret-access-key'],
    // GitHub
    [(
      'gh' + 'p_1234567890abcdefghijklmnopqrstuvwxyz'
    ), 'github-pat'],
    [(
      'gh' + 'o_1234567890abcdefghijklmnopqrstuvwxyz'
    ), 'github-oauth'],
    [(
      'gh' + 's_1234567890abcdefghijklmnopqrstuvwxyz'
    ), 'github-app-token'],
    [(
      'gh' + 'u_1234567890abcdefghijklmnopqrstuvwxyz'
    ), 'github-app-token'],
    // OpenAI
    [(
      'sk-' + 'aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuV'
    ), 'openai-api-key'],
    // Google
    ['AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI', 'google-api-key'],
    // Slack
    [('xo' + 'xb-1234567890-abcdefghijklmnop'), 'slack-token'],
    [('xo' + 'xp-123456789-123456789-1234567890ab'), 'slack-token'],
    // Private key
    ['-----BEGIN RSA PRIVATE KEY-----', 'private-key'],
    ['-----BEGIN PRIVATE KEY-----', 'private-key'],
    ['-----BEGIN EC PRIVATE KEY-----', 'private-key'],
    // Generic
    ['password = "superSecret123!"', 'generic-secret'],
    ['api_key = "abc1234567890xyz"', 'generic-secret'],
    // JWT
    ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', 'jwt'],
    // Stripe
    [('sk' + '_live_1234567890abcdefghijklmn'), 'stripe-key'],
    [('pk' + '_test_1234567890abcdefghijklmn'), 'stripe-key'],
  ])('detects %s as %s', (input, expectedRule) => {
    const result = scanSecrets(input);
    expect(result.clean).toBe(false);
    expect(result.matches.some((m) => m.rule === expectedRule)).toBe(true);
  });
});

describe('scanSecrets — clean text', () => {
  it.each([
    ['Fix the bug in auth middleware'],
    ['git status'],
    ['const name = "John Doe"'],
    ['password validation failed: too short'],
    ['See README for setup instructions'],
    ['The API returns JSON with a status field'],
  ])('allows: %s', (input) => {
    expect(hasSecrets(input)).toBe(false);
    const r = scanSecrets(input);
    expect(r.clean).toBe(true);
    expect(r.redacted).toBe(input);
  });
});

describe('scanSecrets — redaction', () => {
  it('replaces matched secret with [REDACTED]', () => {
    const r = scanSecrets('my token is ' + ('gh' + 'p_1234567890abcdefghijklmnopqrstuvwxyz') + ' and more');
    expect(r.redacted).toContain('[REDACTED]');
    expect(r.redacted).not.toMatch(new RegExp('gh' + 'p_1234567890'));
    expect(r.redacted).toContain('my token is');
    expect(r.redacted).toContain('and more');
  });

  it('redacts multiple secrets independently', () => {
    const r = scanSecrets('AKIAIOSFODNN7EXAMPLE and ' + ('gh' + 'p_1234567890abcdefghijklmnopqrstuvwxyz'));
    expect(r.matches.length).toBeGreaterThanOrEqual(2);
    expect(r.redacted.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('match exposes start/end indices', () => {
    const input = 'token: ' + ('gh' + 'p_1234567890abcdefghijklmnopqrstuvwxyz') + ' end';
    const r = scanSecrets(input);
    const m = r.matches[0];
    expect(input.slice(m.start, m.end)).toBe(m.raw);
  });
});
