export type InjectionSeverity = 'low' | 'medium' | 'high';

export interface InjectionMatch {
  pattern: string;
  severity: InjectionSeverity;
  reason: string;
  index: number;
}

export interface SanitizeResult {
  clean: boolean;
  matches: InjectionMatch[];
  sanitized: string;
}

interface InjectionPattern {
  regex: RegExp;
  pattern: string;
  severity: InjectionSeverity;
  reason: string;
  replacement: string;
}

const PATTERNS: InjectionPattern[] = [
  // Classic instruction overrides
  {
    regex: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?)/gi,
    pattern: 'ignore previous instructions',
    severity: 'high',
    reason: 'instruction override attempt',
    replacement: '[INJECTION_REMOVED]',
  },
  {
    regex: /disregard\s+(all\s+)?(previous|prior|above|earlier|your)\s+(instructions?|prompts?|rules?|directives?)/gi,
    pattern: 'disregard previous instructions',
    severity: 'high',
    reason: 'instruction override attempt',
    replacement: '[INJECTION_REMOVED]',
  },
  {
    regex: /forget\s+(everything|all)\s+(you\s+)?(know|were told|have been told)/gi,
    pattern: 'forget everything',
    severity: 'high',
    reason: 'instruction override attempt',
    replacement: '[INJECTION_REMOVED]',
  },
  {
    regex: /you\s+are\s+now\s+(?:\w+\s+){0,4}(?:AI|assistant|bot|model|GPT|LLM|agent)\b/gi,
    pattern: 'you are now <persona>',
    severity: 'high',
    reason: 'persona injection attempt',
    replacement: '[INJECTION_REMOVED]',
  },
  // System prompt injection
  {
    regex: /\bsystem\s*:\s*[\w\s]{0,50}/gi,
    pattern: 'system: <content>',
    severity: 'high',
    reason: 'system prompt injection',
    replacement: '[SYSTEM_TAG_REMOVED]',
  },
  {
    regex: /<\s*system\s*>/gi,
    pattern: '<system>',
    severity: 'high',
    reason: 'system XML tag injection',
    replacement: '[SYSTEM_TAG_REMOVED]',
  },
  // Role manipulation
  {
    regex: /\bassistant\s*:\s*/gi,
    pattern: 'assistant: (role injection)',
    severity: 'medium',
    reason: 'role injection attempt',
    replacement: '[ROLE_TAG_REMOVED] ',
  },
  {
    regex: /\bhuman\s*:\s*/gi,
    pattern: 'human: (role injection)',
    severity: 'medium',
    reason: 'role injection attempt',
    replacement: '[ROLE_TAG_REMOVED] ',
  },
  // Embedded tool calls
  {
    regex: /<tool_call\b[^>]*>/gi,
    pattern: '<tool_call>',
    severity: 'high',
    reason: 'embedded tool call tag',
    replacement: '[TOOL_CALL_REMOVED]',
  },
  {
    regex: /<function_calls?\b[^>]*>/gi,
    pattern: '<function_calls>',
    severity: 'high',
    reason: 'embedded function call tag',
    replacement: '[TOOL_CALL_REMOVED]',
  },
  // Jailbreak phrases
  {
    regex: /do\s+anything\s+now\b/gi,
    pattern: 'do anything now (DAN)',
    severity: 'high',
    reason: 'jailbreak pattern (DAN)',
    replacement: '[INJECTION_REMOVED]',
  },
  {
    regex: /jailbreak\b/gi,
    pattern: 'jailbreak',
    severity: 'medium',
    reason: 'jailbreak keyword',
    replacement: '[INJECTION_REMOVED]',
  },
  // Prompt leak attempts
  {
    regex: /repeat\s+(everything|the\s+(above|previous|entire|full|whole))\s*(instructions?|prompt|system|text)?/gi,
    pattern: 'repeat everything above',
    severity: 'medium',
    reason: 'prompt leak attempt',
    replacement: '[INJECTION_REMOVED]',
  },
  {
    regex: /print\s+(your\s+)?(system|original|full|entire|initial)\s+(prompt|instructions?|directives?)/gi,
    pattern: 'print system prompt',
    severity: 'medium',
    reason: 'prompt leak attempt',
    replacement: '[INJECTION_REMOVED]',
  },
  // ANSI / control-character smuggling
  {
    regex: /\x1b\[[0-9;]*[A-Za-z]/g,
    pattern: 'ANSI escape sequence',
    severity: 'low',
    reason: 'ANSI escape code — possible terminal injection',
    replacement: '',
  },
];

export function sanitize(text: string): SanitizeResult {
  const matches: InjectionMatch[] = [];
  let sanitized = text;

  for (const p of PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(p.regex.source, p.regex.flags);
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(text)) !== null) {
      matches.push({ pattern: p.pattern, severity: p.severity, reason: p.reason, index: m.index });
    }
    sanitized = sanitized.replace(new RegExp(p.regex.source, p.regex.flags.replace('d', '')), p.replacement);
  }

  return { clean: matches.length === 0, matches, sanitized };
}

export function hasInjection(text: string): boolean {
  return !sanitize(text).clean;
}
