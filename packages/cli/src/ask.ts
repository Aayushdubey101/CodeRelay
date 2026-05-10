import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { OrchestratorOptions, OrchestratorRunResult } from '@coderelay/orchestrator';
import { OrchestratorRunner } from '@coderelay/orchestrator';
import type { PlanStep } from '@coderelay/orchestrator';
import type { AgentName } from '@coderelay/sub-agents';

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

function printPlanTable(steps: PlanStep[]): void {
  console.log('\nExecution Plan:');
  console.log('─'.repeat(70));
  console.log(`  ${'#'.padEnd(4)} ${'Intent'.padEnd(40)} Tool`);
  console.log('─'.repeat(70));
  for (const s of steps) {
    const intent = s.intent.length > 40 ? s.intent.slice(0, 37) + '...' : s.intent;
    const tools = s.toolsNeeded.slice(0, 3).join(', ') || '—';
    console.log(`  ${String(s.step).padEnd(4)} ${intent.padEnd(40)} ${tools}`);
  }
  console.log('─'.repeat(70));
}

async function selectAgent(rl: readline.Interface): Promise<AgentName> {
  console.log('\nAgent:  (1) Claude Code  (2) Gemini CLI');
  const choice = (await rl.question('Select [1]: ')).trim();
  return choice === '2' ? 'gemini' : 'claude';
}

export async function runAskSession(opts: AskSessionOptions): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const factory = opts.runnerFactory ?? ((o) => new OrchestratorRunner(o));

  // Agent selection at session start
  const agentName = await selectAgent(rl);
  const runnerOpts: OrchestratorOptions = { ...opts.orchestratorOpts, agentName };
  const runner = factory(runnerOpts);

  console.log(`\nCodeRelay Interactive [${agentName}] — type your task (empty line to exit)\n`);

  try {
    while (true) {
      const task = (await rl.question('> ')).trim();
      if (!task) {
        console.log('Exiting.');
        break;
      }

      // Show plan before executing
      process.stdout.write(`\nPlanning "${task}"... `);
      let steps: PlanStep[];
      try {
        steps = await runner.plan(task);
        console.log('done.');
      } catch (err) {
        console.error(`\nPlanning failed: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      printPlanTable(steps);

      // Confirmation
      const confirm = (await rl.question('\nProceed? [Y/n/edit] ')).trim().toLowerCase();
      if (confirm === 'n') {
        console.log('Cancelled.\n');
        continue;
      }
      if (confirm === 'edit') {
        const revised = (await rl.question('Revised task: ')).trim();
        if (!revised) { console.log('Cancelled.\n'); continue; }
        // Re-plan with revised task — loop back via next iteration
        process.stdout.write(`\nRe-planning... `);
        try {
          steps = await runner.plan(revised);
          console.log('done.');
          printPlanTable(steps);
          const confirm2 = (await rl.question('\nProceed? [Y/n] ')).trim().toLowerCase();
          if (confirm2 === 'n') { console.log('Cancelled.\n'); continue; }
        } catch (err) {
          console.error(`Re-planning failed: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
      }

      console.log('\nExecuting...\n');

      // Live progress via onProgress callback
      const progressOpts: OrchestratorOptions = {
        ...runnerOpts,
        onProgress: (ev) => {
          const icon = ev.status === 'running' ? '⋯' : ev.status === 'done' ? '✓' : '✗';
          process.stdout.write(`\r  ${icon}  Step ${ev.stepNum}/${ev.totalSteps}: ${ev.intent.slice(0, 50).padEnd(50)}`);
          if (ev.status !== 'running') process.stdout.write('\n');
        },
      };
      const liveRunner = factory(progressOpts);

      let result: OrchestratorRunResult;
      try {
        result = await liveRunner.run(task);
      } catch (err) {
        console.error(`\nExecution error: ${err instanceof Error ? err.message : String(err)}`);
        const retry = (await rl.question('Retry? [y/N] ')).trim().toLowerCase();
        if (retry !== 'y' && retry !== 'yes') continue;
        result = await liveRunner.run(task);
      }

      console.log(formatResult(result));

      if (!opts.autoMerge) {
        const branch = `coderelay/task-${result.taskId.slice(0, 8)}`;
        console.log(`\nBranch: ${branch}`);
        const merge = (await rl.question('Merge changes to main? [y/N] ')).trim().toLowerCase();
        if (merge === 'y' || merge === 'yes') {
          console.log(`\nMerge approved for task ${result.taskId}.`);
          console.log(`Run: git checkout main && git merge ${branch}`);
          console.log(`     coderelay rollback ${result.taskId}  (to undo)\n`);
        } else {
          console.log(`\nChanges left in branch ${branch}. Run: git checkout main\n`);
        }
      }
    }
  } finally {
    rl.close();
  }
}
