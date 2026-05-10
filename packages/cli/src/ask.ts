import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { OrchestratorOptions, OrchestratorRunResult } from '@coderelay/orchestrator';
import { OrchestratorRunner } from '@coderelay/orchestrator';

export type AskOrchestratorFactory = (opts: OrchestratorOptions) => OrchestratorRunner;

export interface AskSessionOptions {
  orchestratorOpts: OrchestratorOptions;
  /** Override factory for testing. */
  runnerFactory?: AskOrchestratorFactory;
  /** If true, skip merge confirmation prompt. */
  autoMerge?: boolean;
}

export function formatResult(result: OrchestratorRunResult): string {
  const lines: string[] = [
    `\nTask ${result.taskId.slice(0, 8)} complete.`,
    `  Steps executed : ${result.results.length}`,
    `  Facts written  : ${result.factsWritten}`,
    `  Drift detected : ${result.driftDetected ? 'yes (replanned)' : 'no'}`,
  ];
  const passed = result.verifications.filter(v => v.passed).length;
  lines.push(`  Verifications  : ${passed}/${result.verifications.length} passed`);
  return lines.join('\n');
}

export async function runAskSession(opts: AskSessionOptions): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const factory = opts.runnerFactory ?? ((o) => new OrchestratorRunner(o));
  const runner = factory(opts.orchestratorOpts);

  console.log('\nCodeRelay Interactive — type your task (empty line to exit)\n');

  try {
    while (true) {
      const task = (await rl.question('> ')).trim();
      if (!task) {
        console.log('Exiting.');
        break;
      }

      console.log(`\nPlanning "${task}"...`);

      let result: OrchestratorRunResult;
      try {
        result = await runner.run(task);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        const retry = (await rl.question('Retry? [y/N] ')).trim().toLowerCase();
        if (retry !== 'y' && retry !== 'yes') continue;
        result = await runner.run(task);
      }

      console.log(formatResult(result));

      if (!opts.autoMerge) {
        const merge = (await rl.question('\nMerge changes to main? [y/N] ')).trim().toLowerCase();
        if (merge === 'y' || merge === 'yes') {
          console.log(`\nMerge approved for task ${result.taskId}.`);
          console.log(`Run: coderelay rollback ${result.taskId}  (to undo if needed)\n`);
        } else {
          console.log(`\nChanges left in worktree branch. Run: git checkout main\n`);
        }
      }
    }
  } finally {
    rl.close();
  }
}
