import type { QualityResult } from './qualityRunner.js';

const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GRN = '\x1b[32m';
const YEL = '\x1b[33m';
const RST = '\x1b[0m';

export function printQualityReport(r: QualityResult): void {
  console.log(`\n${BOLD}Quality Report — ${r.path}${RST}`);
  console.log('─'.repeat(60));

  // Complexity
  const highCC = r.complexity.flatMap(f =>
    f.functions.filter(fn => fn.complexity > 10).map(fn => ({ file: f.file, ...fn }))
  );
  console.log(`\n${BOLD}Cyclomatic Complexity${RST}`);
  if (highCC.length === 0) {
    console.log(`  ${GRN}✓ All functions within threshold${RST}`);
  } else {
    for (const fn of highCC.slice(0, 10)) {
      const col = fn.complexity > 20 ? RED : YEL;
      console.log(`  ${col}${fn.complexity}${RST}  ${fn.name}  (${fn.file}:${fn.line})`);
    }
    if (highCC.length > 10) console.log(`  … and ${highCC.length - 10} more`);
  }

  // Duplication
  const rate = (r.duplication.duplicateLineRate * 100).toFixed(1);
  const rateColor = r.duplication.duplicateLineRate > 0.15 ? RED : r.duplication.duplicateLineRate > 0.05 ? YEL : GRN;
  console.log(`\n${BOLD}Code Duplication${RST}`);
  console.log(`  Rate: ${rateColor}${rate}%${RST}  (${r.duplication.duplicates.length} duplicate blocks)`);

  // SOLID
  const scoreColor = r.solid.score >= 80 ? GRN : r.solid.score >= 60 ? YEL : RED;
  console.log(`\n${BOLD}SOLID Score${RST}: ${scoreColor}${r.solid.score}/100${RST}`);
  for (const v of r.solid.violations.slice(0, 8)) {
    const col = v.severity === 'high' ? RED : v.severity === 'medium' ? YEL : RST;
    console.log(`  ${col}[${v.principle}]${RST} ${v.description}`);
    console.log(`         ${v.file}`);
  }

  // Summary
  console.log(`\n${BOLD}Result: ${r.passed ? GRN + 'PASS' : RED + 'FAIL'}${RST}\n`);
}
