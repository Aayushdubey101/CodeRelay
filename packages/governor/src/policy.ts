import { readFileSync, existsSync } from 'node:fs';
import { load as yamlLoad } from 'js-yaml';

export interface PolicyConfig {
  commands?: {
    allow?: string[];   // glob patterns for allowed commands
    deny?: string[];    // glob patterns for denied commands
  };
  paths?: {
    writable?: string[];  // glob patterns for writable paths
    readonly?: string[];  // glob patterns for read-only paths
    forbidden?: string[]; // glob patterns for forbidden paths
  };
  network?: {
    allow?: string[];  // allowed egress domains
  };
  env?: {
    deny?: string[];   // env vars that cannot be passed to sub-agents
  };
}

export interface PolicyResult {
  allowed: boolean;
  reason: string;
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesAny(value: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegex(p).test(value));
}

function extractCommand(commandLine: string): string {
  return commandLine.trim().split(/\s+/)[0] ?? '';
}

export class PolicyEngine {
  private _config: PolicyConfig;

  constructor(config: PolicyConfig | string = {}) {
    if (typeof config === 'string') {
      this._config = PolicyEngine.load(config);
    } else {
      this._config = config;
    }
  }

  static load(configPath: string): PolicyConfig {
    if (!existsSync(configPath)) return {};
    try {
      const raw = readFileSync(configPath, 'utf8');
      return (yamlLoad(raw) as PolicyConfig) ?? {};
    } catch {
      return {};
    }
  }

  static fromYaml(yamlStr: string): PolicyEngine {
    const config = (yamlLoad(yamlStr) as PolicyConfig) ?? {};
    return new PolicyEngine(config);
  }

  evaluateCommand(commandLine: string): PolicyResult {
    const cmd = extractCommand(commandLine);

    const deny = this._config.commands?.deny ?? [];
    const allow = this._config.commands?.allow ?? [];

    if (deny.length > 0 && matchesAny(cmd, deny)) {
      return { allowed: false, reason: `Command '${cmd}' matches deny list` };
    }

    if (allow.length > 0 && !matchesAny(cmd, allow)) {
      return { allowed: false, reason: `Command '${cmd}' not in allow list` };
    }

    return { allowed: true, reason: 'Command permitted by policy' };
  }

  evaluatePath(filePath: string, mode: 'read' | 'write'): PolicyResult {
    const forbidden = this._config.paths?.forbidden ?? [];
    if (forbidden.length > 0 && matchesAny(filePath, forbidden)) {
      return { allowed: false, reason: `Path '${filePath}' is forbidden` };
    }

    if (mode === 'write') {
      const writable = this._config.paths?.writable ?? [];
      if (writable.length > 0 && !matchesAny(filePath, writable)) {
        return { allowed: false, reason: `Path '${filePath}' is not in writable list` };
      }
    }

    if (mode === 'read') {
      const readonly = this._config.paths?.readonly ?? [];
      if (readonly.length > 0 && matchesAny(filePath, readonly)) {
        // Readonly paths are allowed to read but not write — reading is OK
      }
    }

    return { allowed: true, reason: 'Path access permitted by policy' };
  }

  isEnvVarAllowed(name: string): boolean {
    const denied = this._config.env?.deny ?? [];
    return !matchesAny(name, denied);
  }

  isDomainAllowed(domain: string): boolean {
    const allowed = this._config.network?.allow ?? [];
    if (allowed.length === 0) return true; // no restriction
    return matchesAny(domain, allowed);
  }

  get config(): PolicyConfig {
    return this._config;
  }
}
