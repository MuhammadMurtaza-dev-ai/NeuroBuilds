import crypto from 'crypto';
import chalk from 'chalk';
import type { BlogState, PipelineOptions } from '../types';
import { upsertState } from './stateManager';
import { researchNode } from '../nodes/researchNode';
import { draftNode } from '../nodes/draftNode';
import { criticNode } from '../nodes/criticNode';
import { saveCheckpoint } from '../nodes/hitlCheckpoint';
import { publishingNode } from '../nodes/publishingNode';
import { createMockState } from '../mock/mockProvider';

/** Maximum number of draft+critique cycles before forwarding to human review. */
const MAX_CRITIQUE_ITERATIONS = 2;

function createInitialState(topic: string): BlogState {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    topic,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Phase 1 — Research + Actor-Critic loop + HITL checkpoint.
 *
 * Live mode stages:
 *   [1/4] researchNode  — Tavily web search
 *   [2/4] draftNode     — writer LLM (Claude)
 *   [3/4] criticNode    — critic LLM (Claude 3.5 Sonnet)
 *         If requiresRevision && iterations < MAX_CRITIQUE_ITERATIONS → back to [2/4]
 *         Otherwise → proceed to checkpoint
 *   [4/4] saveCheckpoint → status: pending_approval
 *
 * Mock mode: synthetic research+draft data, no real API calls.
 */
export async function runResearchAndDraft(
  topic: string,
  options: PipelineOptions = {}
): Promise<BlogState> {
  const { mock = false } = options;

  let state: BlogState;

  if (mock) {
    console.log(chalk.yellow('\n[MOCK MODE] Using synthetic research and draft data\n'));
    state = createMockState(topic, crypto.randomUUID());
    await upsertState(state);
  } else {
    state = createInitialState(topic);
    await upsertState(state);

    // ── Stage 1: Research ───────────────────────────────────────────────────
    console.log(chalk.cyan('\n[1/4] Research'));
    state = { ...state, status: 'researching' };
    await upsertState(state);
    state = await researchNode(state);

    // ── Stages 2 + 3: Actor-Critic loop ────────────────────────────────────
    let iteration = 0;
    let criticFeedback: string[] | undefined;

    for (;;) {
      const iterLabel = `${iteration + 1}/${MAX_CRITIQUE_ITERATIONS}`;

      console.log(chalk.cyan(`\n[2/4] Draft    (iteration ${iterLabel})`));
      state = await draftNode(state, criticFeedback);

      console.log(chalk.cyan(`\n[3/4] Critique (iteration ${iterLabel})`));
      const { state: afterCritic, report } = await criticNode(state);
      state = { ...afterCritic, draftIteration: iteration + 1 };
      await upsertState(state);

      iteration++;

      if (!report.requiresRevision) {
        console.log(chalk.green(`  ✓ Critic approved the draft (score ${report.score}/100)`));
        break;
      }

      if (iteration >= MAX_CRITIQUE_ITERATIONS) {
        console.log(
          chalk.yellow(
            `  ⚠  Critique cap reached after ${MAX_CRITIQUE_ITERATIONS} iteration(s) — ` +
              `forwarding to human review (score ${report.score}/100)`
          )
        );
        break;
      }

      console.log(
        chalk.yellow(
          `\n  Score ${report.score}/100 — routing back to writer ` +
            `(${iteration}/${MAX_CRITIQUE_ITERATIONS} iterations used)…`
        )
      );
      criticFeedback = report.feedback;
    }
  }

  // ── Stage 4: HITL checkpoint ────────────────────────────────────────────
  console.log(chalk.cyan(mock ? '\n[2/2] Saving checkpoint' : '\n[4/4] Saving checkpoint'));
  const draftPath = await saveCheckpoint(state);

  state = { ...state, status: 'pending_approval' };
  await upsertState(state);

  console.log(`  ✓ Draft written to ${draftPath}`);
  return state;
}

/**
 * Phase 2 — Publishing.
 *
 * Transitions the state through `publishing` → `completed`. Must be called
 * only after the state has been set to `approved` by the review CLI.
 */
export async function runPublishing(state: BlogState): Promise<BlogState> {
  if (state.status !== 'approved') {
    throw new Error(
      `runPublishing: expected status "approved", got "${state.status}". ` +
        `Run the review CLI first: npm run review`
    );
  }

  console.log(chalk.cyan('\n[Publishing]'));

  const publishing: BlogState = { ...state, status: 'publishing' };
  await upsertState(publishing);

  return publishingNode(publishing);
}
