/**
 * Egress filter for Docker mode — domain allow-list check.
 * The actual network blocking is done by Docker's --network or iptables rules;
 * this module provides the allow-list logic and a fetch wrapper for in-process calls.
 */

export interface EgressConfig {
  /** Glob patterns for allowed domains. Supports leading wildcard: *.example.com */
  allowDomains?: string[];
  /** Explicit deny list (checked after allow). Overrides allow. */
  denyDomains?: string[];
}

export interface EgressResult {
  allowed: boolean;
  domain: string;
  reason?: string;
}

function domainMatchesGlob(domain: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return domain.endsWith('.' + suffix);
  }
  return domain === pattern;
}

function normalizeDomain(raw: string): string {
  const noProto = raw.replace(/^https?:\/\//i, '');
  const noPath = noProto.split('/')[0] ?? noProto;
  const noPort = noPath.split(':')[0] ?? noPath;
  return noPort.toLowerCase();
}

export class EgressFilter {
  private readonly _allow: string[];
  private readonly _deny: string[];

  constructor(cfg: EgressConfig = {}) {
    this._allow = cfg.allowDomains ?? [];
    this._deny  = cfg.denyDomains  ?? [];
  }

  check(domain: string): EgressResult {
    const d = normalizeDomain(domain);

    // Deny list always wins
    for (const pattern of this._deny) {
      if (domainMatchesGlob(d, pattern.toLowerCase())) {
        return { allowed: false, domain: d, reason: `domain blocked by deny list (${pattern})` };
      }
    }

    // Empty allow list = allow all
    if (this._allow.length === 0) {
      return { allowed: true, domain: d };
    }

    for (const pattern of this._allow) {
      if (domainMatchesGlob(d, pattern.toLowerCase())) {
        return { allowed: true, domain: d };
      }
    }

    return { allowed: false, domain: d, reason: 'domain not in allow list' };
  }

  /**
   * Wrapper around global fetch that enforces the egress filter.
   * Throws if the domain is not allowed. Uses `unknown` for params to avoid DOM type dependency.
   */
  async fetch(url: string, init?: unknown): Promise<unknown> {
    const { hostname } = new URL(url);
    const result = this.check(hostname);
    if (!result.allowed) {
      throw new Error(`EgressFilter: blocked request to ${hostname} — ${result.reason}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).fetch(url, init);
  }
}

/** Helper: extract hostname from a URL string, silently returns empty string on parse error. */
export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
