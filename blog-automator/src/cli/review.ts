/**
 * Interactive HITL review CLI.
 * Usage: npm run review
 *
 * Loads all `pending_approval` drafts from state.json, displays each one
 * with chalk formatting, and prompts: (A)pprove / (E)dit / (R)eject.
 */

// Config must be imported first so dotenv runs before any env access.
import '../config';

import readline from 'readline';
import chalk from 'chalk';
import type { BlogState } from '../types';
import {
  getPendingStates,
  upsertState,
  saveDraftFile,
  loadDraftFile,
} from '../engine/stateManager';
import { displayDraft } from '../nodes/hitlCheckpoint';
import { runPublishing } from '../engine/pipeline';

// ── Utilities ──────────────────────────────────────────────────────────────

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function pickState(pending: BlogState[]): Promise<BlogState> {
  if (pending.length === 1) return pending[0];

  console.log(chalk.bold('\nMultiple drafts are pending review:\n'));
  pending.forEach((s, i) => {
    const shortId = s.id.slice(0, 8);
    console.log(`  [${i + 1}] ${chalk.yellow(s.topic)} ${chalk.gray(`(${shortId}…)`)}`);
  });
  console.log();

  const answer = await ask(chalk.bold('Select a draft number: '));
  const idx = parseInt(answer, 10) - 1;

  if (Number.isNaN(idx) || idx < 0 || idx >= pending.length) {
    throw new Error(`Invalid selection: "${answer}"`);
  }
  return pending[idx];
}

// ── Action handlers ────────────────────────────────────────────────────────

async function handleApprove(state: BlogState): Promise<BlogState | null> {
  const confirm = await ask(chalk.yellow('\nPublish this draft? [y/N]: '));
  if (confirm.toLowerCase() !== 'y') {
    console.log(chalk.gray('\n  Cancelled — returning to review menu.\n'));
    return null; // signals the caller to re-display
  }

  const approved: BlogState = {
    ...state,
    status: 'approved',
    approvedAt: new Date().toISOString(),
  };
  await upsertState(approved);

  const final = await runPublishing(approved);

  const SEP = chalk.green('═'.repeat(72));
  console.log('\n' + SEP);
  console.log(chalk.bold.green('  PIPELINE COMPLETE'));
  console.log(SEP);
  console.log(`\n  ${chalk.bold('Topic:')}     ${final.topic}`);
  console.log(`  ${chalk.bold('Status:')}    ${chalk.green(final.status)}`);
  console.log(`  ${chalk.bold('Published:')} ${final.publishedAt ?? '—'}`);
  console.log();

  return final;
}

async function handleEdit(state: BlogState): Promise<BlogState> {
  const filePath = await saveDraftFile(state.id, state.draftMarkdown ?? '');

  console.log(chalk.yellow(`\n  Draft written to: ${filePath}`));
  console.log(chalk.white('  Open it in your editor, make your changes, then come back here.'));
  console.log();

  await ask(chalk.bold('  Press Enter when you have finished editing…'));

  const edited = await loadDraftFile(state.id);
  const updated: BlogState = {
    ...state,
    draftMarkdown: edited,
    editHistory: [...(state.editHistory ?? []), state.draftMarkdown ?? ''],
  };
  await upsertState(updated);

  console.log(chalk.green('\n  ✓ Draft reloaded — updated content will be shown below.\n'));
  return updated;
}

async function handleReject(state: BlogState): Promise<BlogState | null> {
  const confirm = await ask(chalk.red('\nReject and discard this draft permanently? [y/N]: '));
  if (confirm.toLowerCase() !== 'y') {
    console.log(chalk.gray('\n  Cancelled.\n'));
    return null;
  }

  const rejected: BlogState = {
    ...state,
    status: 'failed',
    errorMessage: 'Rejected by reviewer',
  };
  await upsertState(rejected);

  console.log(chalk.red('\n  ✗ Draft rejected.\n'));
  return rejected;
}

// ── Main review loop ───────────────────────────────────────────────────────

async function reviewLoop(initial: BlogState): Promise<void> {
  let state = initial;

  while (true) {
    displayDraft(state);

    console.log(chalk.bold('  What would you like to do?\n'));
    console.log(`    ${chalk.green('[A]')}  Approve — publish the draft as-is`);
    console.log(`    ${chalk.yellow('[E]')}  Edit    — open the draft file in your editor`);
    console.log(`    ${chalk.red('[R]')}  Reject  — discard this draft`);
    console.log();

    const raw = await ask(chalk.bold('  Your choice [A / E / R]: '));
    const choice = raw.toUpperCase();

    if (choice === 'A') {
      const result = await handleApprove(state);
      if (result !== null) return; // done — pipeline complete
    } else if (choice === 'E') {
      state = await handleEdit(state);
    } else if (choice === 'R') {
      const result = await handleReject(state);
      if (result !== null) return; // done — draft discarded
    } else {
      console.log(chalk.red(`\n  Unknown option "${raw}". Enter A, E, or R.\n`));
    }
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(chalk.bold.cyan('\n  Blog Automator — Review CLI\n'));

  const pending = await getPendingStates();

  if (pending.length === 0) {
    console.log(chalk.yellow('  No drafts are currently pending review.'));
    console.log(
      chalk.gray(
        '  Generate one with:\n' +
          '    npm run start -- "Your Topic"   (live)\n' +
          '    npm run mock                     (mock data)\n'
      )
    );
    process.exit(0);
  }

  const state = await pickState(pending);
  await reviewLoop(state);
}

main().catch((err: unknown) => {
  console.error(
    '\n' + chalk.red('  Fatal error:'),
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
