export interface SecretMatch {
  rule: string;
  description: string;
  start: number;
  end: number;
  raw: string;
  masked: string;
}

export interface ScanResult {
  clean: boolean;
  matches: SecretMatch[];
  redacted: string;
}

interface SecretRule {
  id: string;
  description: string;
  regex: RegExp;
}

const MASK = '[REDACTED]';

// Derived from gitleaks default rules — regex patterns only, no code copied.
const RULES: SecretRule[] = [
  // AWS
  {
    id: 'aws-access-key-id',
    description: 'AWS Access Key ID',
    regex: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'aws-secret-access-key',
    description: 'AWS Secret Access Key',
    regex: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*["']?([A-Za-z0-9\/+=]{40})["']?/gi,
  },
  // GitHub
  {
    id: 'github-pat',
    description: 'GitHub Personal Access Token (classic)',
    regex: /\bghp_[0-9A-Za-z]{36}\b/g,
  },
  {
    id: 'github-fine-grained-pat',
    description: 'GitHub Fine-Grained PAT',
    regex: /\bgithub_pat_[0-9A-Za-z_]{82}\b/g,
  },
  {
    id: 'github-oauth',
    description: 'GitHub OAuth token',
    regex: /\bgho_[0-9A-Za-z]{36}\b/g,
  },
  {
    id: 'github-app-token',
    description: 'GitHub App Token',
    regex: /\b(?:ghs|ghu)_[0-9A-Za-z]{36}\b/g,
  },
  // Anthropic / OpenAI
  {
    id: 'anthropic-api-key',
    description: 'Anthropic API Key',
    regex: /\bsk-ant-[A-Za-z0-9\-_]{90,100}\b/g,
  },
  {
    id: 'openai-api-key',
    description: 'OpenAI API Key',
    regex: /\bsk-[A-Za-z0-9]{48}\b/g,
  },
  // Google
  {
    id: 'google-api-key',
    description: 'Google API Key',
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  },
  {
    id: 'google-oauth',
    description: 'Google OAuth Client Secret',
    regex: /\bGOCPS[0-9A-Za-z\-_]{28}\b/g,
  },
  // Slack
  {
    id: 'slack-token',
    description: 'Slack Token',
    regex: /\bxox[baprs]-[0-9A-Za-z\-]{10,48}\b/g,
  },
  {
    id: 'slack-webhook',
    description: 'Slack Webhook URL',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Z]{8,}\/B[0-9A-Z]{8,}\/[0-9A-Za-z]{24}/g,
  },
  // Private keys
  {
    id: 'private-key',
    description: 'Private Key (PEM)',
    regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE KEY-----/g,
  },
  // Generic high-entropy secrets with context labels
  {
    id: 'generic-secret',
    description: 'Generic secret assignment',
    regex: /(?:password|passwd|secret|api_?key|auth_?token|access_?token)\s*[=:]\s*["']([^"'\s]{12,})["']/gi,
  },
  {
    id: 'jwt',
    description: 'JSON Web Token',
    regex: /\bey[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g,
  },
  // Stripe
  {
    id: 'stripe-key',
    description: 'Stripe API Key',
    regex: /\b(?:sk|pk|rk)_(?:live|test)_[0-9A-Za-z]{24,}\b/g,
  },
  // SendGrid
  {
    id: 'sendgrid-key',
    description: 'SendGrid API Key',
    regex: /\bSG\.[0-9A-Za-z\-_]{22}\.[0-9A-Za-z\-_]{43}\b/g,
  },
];

function maskSecret(raw: string): string {
  if (raw.length <= 8) return MASK;
  return raw.slice(0, 4) + '…' + raw.slice(-4) + MASK;
}

export function scanSecrets(text: string): ScanResult {
  const matches: SecretMatch[] = [];

  for (const rule of RULES) {
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      matches.push({
        rule: rule.id,
        description: rule.description,
        start: m.index,
        end: m.index + raw.length,
        raw,
        masked: maskSecret(raw),
      });
    }
  }

  // Build redacted string — process from end to start to preserve indices
  let redacted = text;
  const sorted = [...matches].sort((a, b) => b.start - a.start);
  for (const match of sorted) {
    redacted = redacted.slice(0, match.start) + MASK + redacted.slice(match.end);
  }

  return { clean: matches.length === 0, matches, redacted };
}

export function hasSecrets(text: string): boolean {
  return !scanSecrets(text).clean;
}
