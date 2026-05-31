import chalk from 'chalk';
import type { BlogState, CritiqueReport } from '../types';
import { saveDraftFile } from '../engine/stateManager';

/** Applies minimal chalk colouring to markdown headings and list items for terminal display. */
function renderMarkdownPreview(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (/^# /.test(line)) return chalk.bold.cyan(line);
      if (/^## /.test(line)) return chalk.bold.yellow(line);
      if (/^### /.test(line)) return chalk.bold.white(line);
      if (/^[-*] /.test(line)) return chalk.green(line);
      if (/^\d+\. /.test(line)) return chalk.green(line);
      if (/^>/.test(line)) return chalk.italic.gray(line);
      if (/^```/.test(line)) return chalk.bgBlack.cyan(line);
      if (/\*\*[^*]+\*\*/.test(line)) {
        // Bold inline segments — colour the whole line softly
        return chalk.white(line);
      }
      return line;
    })
    .join('\n');
}

/**
 * Persists the current draft to disk as a standalone .md file so the user
 * can open it in any editor during the Edit flow.
 * Returns the absolute path of the saved file.
 */
export async function saveCheckpoint(state: BlogState): Promise<string> {
  if (!state.draftMarkdown) {
    throw new Error('saveCheckpoint: state has no draftMarkdown — run draftNode first.');
  }
  return saveDraftFile(state.id, state.draftMarkdown);
}

/** Renders the automated critic's structured report as a chalk-formatted panel. */
function renderCritiquePanel(report: CritiqueReport): void {
  const LINE = chalk.dim('─'.repeat(72));

  const scoreColor =
    report.score >= 75 ? chalk.green : report.score >= 50 ? chalk.yellow : chalk.red;
  const verdict = report.requiresRevision
    ? chalk.yellow('⚠  Requested revision (forwarded after cap)')
    : chalk.green('✓  Approved by critic');

  console.log(chalk.bold.magenta('  AUTOMATED CRITIC REPORT'));
  console.log();
  console.log(`  ${chalk.bold('Score:')}   ${scoreColor(`${report.score}/100`)}`);
  console.log(`  ${chalk.bold('Verdict:')} ${verdict}`);

  if (report.feedback.length > 0) {
    console.log();
    console.log(`  ${chalk.bold('Feedback:')}`);
    report.feedback.forEach((f, i) => {
      console.log(`    ${chalk.dim(`${i + 1}.`)} ${f}`);
    });
  }

  console.log();
  console.log(LINE);
}

/** Pretty-prints the blog draft and, when present, the automated critique to stdout. */
export function displayDraft(state: BlogState): void {
  const SEP = chalk.cyan('═'.repeat(72));
  const LINE = chalk.dim('─'.repeat(72));

  console.log('\n' + SEP);
  console.log(chalk.bold.cyan('  BLOG DRAFT REVIEW'));
  console.log(SEP);
  console.log();
  console.log(`${chalk.bold('  Topic:')}      ${chalk.yellow(state.topic)}`);
  console.log(`${chalk.bold('  ID:')}         ${chalk.gray(state.id)}`);
  console.log(`${chalk.bold('  Date:')}       ${chalk.gray(state.createdAt)}`);
  if (state.draftIteration !== undefined) {
    console.log(
      `${chalk.bold('  Iterations:')} ${chalk.gray(`${state.draftIteration} critic cycle(s)`)}`
    );
  }
  console.log();
  console.log(LINE);
  console.log();

  const content = state.draftMarkdown ?? chalk.red('(no draft content)');
  console.log(renderMarkdownPreview(content));

  console.log();
  console.log(LINE);

  if (state.critiqueReport) {
    console.log();
    renderCritiquePanel(state.critiqueReport);
  }
}
