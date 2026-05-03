import { checkBlocklist, type BlockResult } from './blocklist.js';
import { PolicyEngine, type PolicyConfig, type PolicyResult } from './policy.js';

export interface GovernorResult {
  allowed: boolean;
  reason: string;
  blockedBy?: 'blocklist' | 'policy';
  blocklistMatch?: BlockResult;
}

export class Governor {
  private readonly _policy: PolicyEngine;

  constructor(config?: PolicyConfig | string) {
    this._policy = new PolicyEngine(config ?? {});
  }

  checkCommand(command: string): GovernorResult {
    const block = checkBlocklist(command);
    if (block !== null) {
      return {
        allowed: false,
        reason: `BLOCKED [${block.pattern}]: ${block.reason}`,
        blockedBy: 'blocklist',
        blocklistMatch: block,
      };
    }

    const policy: PolicyResult = this._policy.evaluateCommand(command);
    if (!policy.allowed) {
      return { allowed: false, reason: policy.reason, blockedBy: 'policy' };
    }

    return { allowed: true, reason: policy.reason };
  }

  checkPath(filePath: string, mode: 'read' | 'write'): GovernorResult {
    const policy: PolicyResult = this._policy.evaluatePath(filePath, mode);
    if (!policy.allowed) {
      return { allowed: false, reason: policy.reason, blockedBy: 'policy' };
    }
    return { allowed: true, reason: policy.reason };
  }

  checkEnvVar(name: string): GovernorResult {
    if (!this._policy.isEnvVarAllowed(name)) {
      return { allowed: false, reason: `Env var '${name}' is denied by policy`, blockedBy: 'policy' };
    }
    return { allowed: true, reason: 'Env var permitted' };
  }

  checkDomain(domain: string): GovernorResult {
    if (!this._policy.isDomainAllowed(domain)) {
      return { allowed: false, reason: `Domain '${domain}' is not in network allow list`, blockedBy: 'policy' };
    }
    return { allowed: true, reason: 'Domain permitted' };
  }
}
