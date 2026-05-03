import { describe, it, expect } from 'vitest';
import { checkBlocklist, BLOCKLIST_PATTERNS } from '../blocklist.js';
import { PolicyEngine } from '../policy.js';
import { Governor } from '../governor.js';

// ── Blocklist ──────────────────────────────────────────────────────────────

describe('checkBlocklist', () => {
  it.each([
    ['rm -rf /tmp/foo'],
    ['rm -fr /home/user'],
    ['rm  -rf .'],
    ['sudo rm -rf /'],
    ['mkfs.ext4 /dev/sda'],
    ['dd if=/dev/zero of=/dev/sda'],
    ['DROP TABLE users'],
    ['drop table "orders"'],
    ['DROP DATABASE mydb'],
    ['DROP SCHEMA public'],
    ['TRUNCATE TABLE sessions'],
    ['git push --force origin main'],
    ['git push -f'],
    ['git reset --hard HEAD~1'],
    ['git clean -fd'],
    ['chmod 777 -R /var/www'],
    ['chmod -R 777 /etc'],
    [':(){ :|:& };:'],
    ['echo test > /etc/passwd'],
    ['cat data > /dev/sda'],
    ['shred -u secret.key'],
  ])('blocks: %s', (cmd) => {
    const result = checkBlocklist(cmd);
    expect(result).not.toBeNull();
    expect(result!.blocked).toBe(true);
    expect(result!.pattern.length).toBeGreaterThan(0);
  });

  it.each([
    ['ls -la'],
    ['cat file.txt'],
    ['git status'],
    ['git push origin main'],
    ['git reset HEAD file.ts'],
    ['chmod 644 readme.txt'],
    ['npm install'],
    ['pnpm build'],
    ['SELECT * FROM users'],
    ['echo hello'],
    ['node index.js'],
  ])('allows safe command: %s', (cmd) => {
    expect(checkBlocklist(cmd)).toBeNull();
  });

  it('BLOCKLIST_PATTERNS is non-empty', () => {
    expect(BLOCKLIST_PATTERNS.length).toBeGreaterThan(10);
  });
});

// ── PolicyEngine ───────────────────────────────────────────────────────────

describe('PolicyEngine', () => {
  it('allows all commands by default (empty config)', () => {
    const p = new PolicyEngine({});
    expect(p.evaluateCommand('rm foo').allowed).toBe(true);
  });

  it('deny list blocks matching command', () => {
    const p = PolicyEngine.fromYaml(`
commands:
  deny: ['rm', 'curl']
`);
    expect(p.evaluateCommand('rm foo').allowed).toBe(false);
    expect(p.evaluateCommand('curl http://example.com').allowed).toBe(false);
    expect(p.evaluateCommand('ls -la').allowed).toBe(true);
  });

  it('allow list blocks commands not in list', () => {
    const p = PolicyEngine.fromYaml(`
commands:
  allow: ['node', 'pnpm', 'git']
`);
    expect(p.evaluateCommand('node index.js').allowed).toBe(true);
    expect(p.evaluateCommand('pnpm build').allowed).toBe(true);
    expect(p.evaluateCommand('curl http://bad.com').allowed).toBe(false);
  });

  it('allows wildcard glob in allow list', () => {
    const p = PolicyEngine.fromYaml(`
commands:
  allow: ['git*', 'node']
`);
    expect(p.evaluateCommand('git push').allowed).toBe(true);
    expect(p.evaluateCommand('git status').allowed).toBe(true);
    expect(p.evaluateCommand('rm foo').allowed).toBe(false);
  });

  it('path read permitted by default', () => {
    const p = new PolicyEngine({});
    expect(p.evaluatePath('/tmp/file.txt', 'read').allowed).toBe(true);
  });

  it('forbidden path blocks read and write', () => {
    const p = PolicyEngine.fromYaml(`
paths:
  forbidden: ['/etc/*', '/proc/*']
`);
    expect(p.evaluatePath('/etc/passwd', 'read').allowed).toBe(false);
    expect(p.evaluatePath('/proc/1/mem', 'write').allowed).toBe(false);
    expect(p.evaluatePath('/tmp/file.txt', 'write').allowed).toBe(true);
  });

  it('writable list restricts write access', () => {
    const p = PolicyEngine.fromYaml(`
paths:
  writable: ['/tmp/*', '/workspace/*']
`);
    expect(p.evaluatePath('/tmp/foo.txt', 'write').allowed).toBe(true);
    expect(p.evaluatePath('/etc/hosts', 'write').allowed).toBe(false);
  });

  it('env var deny list', () => {
    const p = PolicyEngine.fromYaml(`
env:
  deny: ['AWS_SECRET*', 'GITHUB_TOKEN']
`);
    expect(p.isEnvVarAllowed('AWS_SECRET_ACCESS_KEY')).toBe(false);
    expect(p.isEnvVarAllowed('GITHUB_TOKEN')).toBe(false);
    expect(p.isEnvVarAllowed('PATH')).toBe(true);
  });

  it('network allow list', () => {
    const p = PolicyEngine.fromYaml(`
network:
  allow: ['api.openai.com', '*.anthropic.com']
`);
    expect(p.isDomainAllowed('api.openai.com')).toBe(true);
    expect(p.isDomainAllowed('api.anthropic.com')).toBe(true);
    expect(p.isDomainAllowed('evil.com')).toBe(false);
  });
});

// ── Governor (combined) ───────────────────────────────────────────────────

describe('Governor', () => {
  it('blocklist takes precedence over policy', () => {
    const g = new Governor({ commands: { allow: ['rm', 'git'] } });
    const r = g.checkCommand('rm -rf /');
    expect(r.allowed).toBe(false);
    expect(r.blockedBy).toBe('blocklist');
  });

  it('policy deny works for non-blocklisted command', () => {
    const g = new Governor({ commands: { deny: ['curl'] } });
    const r = g.checkCommand('curl https://example.com');
    expect(r.allowed).toBe(false);
    expect(r.blockedBy).toBe('policy');
  });

  it('safe command with permissive policy is allowed', () => {
    const g = new Governor({});
    expect(g.checkCommand('node index.js').allowed).toBe(true);
  });

  it('checkPath uses policy', () => {
    const g = new Governor({ paths: { forbidden: ['/etc/*'] } });
    expect(g.checkPath('/etc/passwd', 'read').allowed).toBe(false);
    expect(g.checkPath('/tmp/foo', 'write').allowed).toBe(true);
  });

  it('checkEnvVar uses policy', () => {
    const g = new Governor({ env: { deny: ['SECRET*'] } });
    expect(g.checkEnvVar('SECRET_KEY').allowed).toBe(false);
    expect(g.checkEnvVar('PATH').allowed).toBe(true);
  });

  it('checkDomain uses network policy', () => {
    const g = new Governor({ network: { allow: ['api.github.com'] } });
    expect(g.checkDomain('api.github.com').allowed).toBe(true);
    expect(g.checkDomain('malicious.com').allowed).toBe(false);
  });
});
