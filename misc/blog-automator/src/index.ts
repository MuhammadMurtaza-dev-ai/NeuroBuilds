/**
 * Blog Automator — main entry point.
 *
 * Usage:
 *   npm run start -- "Your blog topic"         ← live (requires API keys)
 *   npm run start -- "Your topic" --mock       ← mock data, no API calls
 *   npm run mock                               ← mock with a default topic
 *
 * After the draft is generated, run:
 *   npm run review
 */

// Config import must come first so dotenv is loaded before any env access.
import { validateConfig } from './config';

import chalk from 'chalk';
import { runResearchAndDraft, runPublishing } from './engine/pipeline';
import { displayDraft } from './nodes/hitlCheckpoint';
import { upsertState } from './engine/stateManager';
import type { BlogState } from './types';

// ── Argument parsing ─────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const isMock = argv.includes('--mock');
const topicParts = argv.filter((a) => !a.startsWith('-'));
const DEFAULT_MOCK_TOPIC = 'The Future of AI in Personal Computing';
const topic = topicParts.join(' ').trim() || (isMock ? DEFAULT_MOCK_TOPIC : '');

// ── Helpers ──────────────────────────────────────────────────────────────────

function printBanner(t: string, mock: boolean): void {
  const SEP = chalk.cyan('─'.repeat(60));
  console.log('\n' + SEP);
  console.log(chalk.bold.cyan('  Blog Automator'));
  console.log(SEP);
  console.log(`  ${chalk.bold('Topic:')} ${chalk.yellow(t)}`);
  console.log(`  ${chalk.bold('Mode:')}  ${mock ? chalk.yellow('MOCK (no API calls)') : chalk.green('LIVE')}`);
  console.log();
}

function printNextStep(): void {
  const SEP = chalk.cyan('═'.repeat(60));
  console.log('\n' + SEP);
  console.log(chalk.bold.cyan('  Draft ready for your review'));
  console.log(SEP);
  console.log();
  console.log('  Run the interactive reviewer:');
  console.log(`    ${chalk.bold.white('npm run review')}`);
  console.log();
  console.log('  The reviewer will let you:');
  console.log(`    ${chalk.green('[A]')} Approve and publish`);
  console.log(`    ${chalk.yellow('[E]')} Open the draft file in your editor`);
  console.log(`    ${chalk.red('[R]')} Reject and discard`);
  console.log();
}

function printMockComplete(final: BlogState): void {
  const SEP = chalk.green('═'.repeat(60));
  console.log('\n' + SEP);
  console.log(chalk.bold.green('  MOCK PIPELINE COMPLETE — full loop verified ✓'));
  console.log(SEP);
  console.log(`\n  ${chalk.bold('Topic:')}     ${final.topic}`);
  console.log(`  ${chalk.bold('Status:')}    ${chalk.green(final.status)}`);
  console.log(`  ${chalk.bold('Published:')} ${final.publishedAt ?? '—'}`);
  console.log('\n  All stages ran successfully with zero real API credits.\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!topic) {
    console.error(
      chalk.red('\n  Error: no topic supplied.\n') +
        chalk.gray(
          '  Usage:\n' +
            '    npm run start -- "Your blog topic"\n' +
            '    npm run mock\n'
        )
    );
    process.exit(1);
  }

  printBanner(topic, isMock);

  try {
    validateConfig(isMock);
  } catch (err) {
    console.error(
      chalk.red('  Configuration error:'),
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  }

  try {
    const state = await runResearchAndDraft(topic, { mock: isMock });

    if (isMock) {
      // End-to-end mock: display the draft, auto-approve, and run the publisher.
      displayDraft(state);

      console.log(chalk.yellow('\n  [MOCK] Auto-approving and running publish simulation…\n'));

      const approved: BlogState = {
        ...state,
        status: 'approved',
        approvedAt: new Date().toISOString(),
      };
      await upsertState(approved);

      const final = await runPublishing(approved);
      printMockComplete(final);
    } else {
      printNextStep();
    }
  } catch (err) {
    console.error(
      '\n' + chalk.red('  Pipeline failed:'),
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  }
}

main();
