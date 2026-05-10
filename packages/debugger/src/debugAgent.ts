import { z } from 'zod';
import type { Router } from '@coderelay/router';
import type { LogEntry } from './parser.js';

const DiagnosisSchema = z.object({
  summary: z.string(),
  rootCause: z.string(),
  suggestions: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
});

export type DiagnosisResult = z.infer<typeof DiagnosisSchema>;

export class DebugAgent {
  constructor(private readonly router: Router) {}

  async diagnose(entries: LogEntry[], graphContext = ''): Promise<DiagnosisResult> {
    const relevant = entries.filter(e => e.level === 'error' || e.level === 'warn');
    const prompt = buildPrompt(relevant.length ? relevant : entries, graphContext);

    const chunks: string[] = [];
    for await (const chunk of this.router.complete(
      [{ role: 'user', content: prompt }],
      { tag: 'code-gen', maxTokens: 1000 },
    )) {
      chunks.push(chunk.text);
    }

    const text = chunks.join('');
    const jsonBlock = text.match(/```json\n([\s\S]+?)\n```/)?.[1] ?? text.match(/\{[\s\S]+\}/)?.[0];
    if (!jsonBlock) throw new Error('LLM returned no JSON diagnosis block');

    return DiagnosisSchema.parse(JSON.parse(jsonBlock));
  }
}

function buildPrompt(entries: LogEntry[], ctx: string): string {
  const logText = entries
    .slice(0, 20)
    .map(e => {
      const frames = e.stack?.map(f => `  ${f.raw}`).join('\n') ?? '';
      return `[${e.level.toUpperCase()}] ${e.message}${frames ? '\n' + frames : ''}`;
    })
    .join('\n\n');

  return [
    'Analyze these runtime errors and produce a JSON diagnosis.',
    '',
    '```',
    logText,
    '```',
    ctx ? `\nCodebase context:\n${ctx}` : '',
    '',
    'Return ONLY valid JSON:',
    '```json',
    '{',
    '  "summary": "one-line summary",',
    '  "rootCause": "root cause explanation",',
    '  "suggestions": ["actionable fix 1", "fix 2"],',
    '  "affectedFiles": ["src/file.ts"],',
    '  "severity": "critical|high|medium|low"',
    '}',
    '```',
  ].join('\n');
}
