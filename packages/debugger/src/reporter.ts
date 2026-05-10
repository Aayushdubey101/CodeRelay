import type { DiagnosisResult } from './debugAgent.js';

const SEVERITY_COLOR: Record<string, string> = {
  critical: '\x1b[31m',
  high: '\x1b[33m',
  medium: '\x1b[36m',
  low: '\x1b[32m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export function printDiagnosis(d: DiagnosisResult): void {
  const color = SEVERITY_COLOR[d.severity] ?? '';
  console.log(`\n${BOLD}Debug Diagnosis${RESET}`);
  console.log('─'.repeat(60));
  console.log(`${BOLD}Severity  :${RESET} ${color}${d.severity.toUpperCase()}${RESET}`);
  console.log(`${BOLD}Summary   :${RESET} ${d.summary}`);
  console.log(`${BOLD}Root cause:${RESET} ${d.rootCause}`);

  if (d.affectedFiles.length) {
    console.log(`${BOLD}Files     :${RESET}`);
    d.affectedFiles.forEach(f => console.log(`  • ${f}`));
  }

  console.log(`${BOLD}Fixes     :${RESET}`);
  d.suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log();
}
