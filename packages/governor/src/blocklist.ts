/**
 * Hard-coded destructive command patterns — always blocked, not configurable.
 * Built from scratch, inspired by context-mode ELv2 design (no code copied).
 */

export interface BlockResult {
  blocked: true;
  pattern: string;
  reason: string;
}

interface BlockPattern {
  regex: RegExp;
  pattern: string;
  reason: string;
}

const PATTERNS: BlockPattern[] = [
  // File system destruction
  { regex: /\brm\s+(-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s/i, pattern: 'rm -rf', reason: 'recursive force delete' },
  { regex: /\brmdir\s+\//, pattern: 'rmdir /', reason: 'delete root directory' },
  { regex: /\bmkfs\b/, pattern: 'mkfs', reason: 'format filesystem' },
  { regex: /\bdd\s+if=\//, pattern: 'dd if=/', reason: 'disk overwrite from root' },
  { regex: /\bshred\b/, pattern: 'shred', reason: 'secure file deletion' },
  // SQL destruction
  { regex: /\bDROP\s+TABLE\b/i, pattern: 'DROP TABLE', reason: 'drop database table' },
  { regex: /\bDROP\s+DATABASE\b/i, pattern: 'DROP DATABASE', reason: 'drop entire database' },
  { regex: /\bDROP\s+SCHEMA\b/i, pattern: 'DROP SCHEMA', reason: 'drop database schema' },
  { regex: /\bTRUNCATE\s+TABLE\b/i, pattern: 'TRUNCATE TABLE', reason: 'truncate table data' },
  // Git destruction
  { regex: /\bgit\s+push\s+.*--force\b/i, pattern: 'git push --force', reason: 'force push overwrites remote history' },
  { regex: /\bgit\s+push\s+.*-f\b/i, pattern: 'git push -f', reason: 'force push overwrites remote history' },
  { regex: /\bgit\s+reset\s+--hard\s+.*HEAD/i, pattern: 'git reset --hard', reason: 'destructive history rewrite' },
  { regex: /\bgit\s+clean\s+-[a-z]*f[a-z]*/i, pattern: 'git clean -f', reason: 'delete untracked files' },
  // Permissions
  { regex: /\bchmod\s+777\s+-R/i, pattern: 'chmod 777 -R', reason: 'world-writable recursive chmod' },
  { regex: /\bchmod\s+-R\s+777/i, pattern: 'chmod -R 777', reason: 'world-writable recursive chmod' },
  { regex: /\bchown\s+-R\s+.*\s+\//i, pattern: 'chown -R ... /', reason: 'recursive chown from root' },
  // Fork bomb
  { regex: /:\(\)\s*\{[^}]*\|[^}]*\}/, pattern: ':(){ :|:& };:', reason: 'fork bomb' },
  // Overwrite critical files
  { regex: />\s*\/etc\/passwd/, pattern: '> /etc/passwd', reason: 'overwrite system password file' },
  { regex: />\s*\/etc\/shadow/, pattern: '> /etc/shadow', reason: 'overwrite shadow password file' },
  { regex: />\s*\/dev\/sd[a-z]/, pattern: '> /dev/sd*', reason: 'write to block device' },
  // Crypto-locker patterns
  { regex: /openssl\s+enc\s+.*-e.*-k\s/i, pattern: 'openssl enc -e -k', reason: 'mass file encryption' },
];

export function checkBlocklist(command: string): BlockResult | null {
  for (const p of PATTERNS) {
    if (p.regex.test(command)) {
      return { blocked: true, pattern: p.pattern, reason: p.reason };
    }
  }
  return null;
}

export const BLOCKLIST_PATTERNS = PATTERNS.map((p) => p.pattern);
