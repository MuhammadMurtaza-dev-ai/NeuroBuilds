import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { BlogState, CritiqueReport } from '../types';
import { upsertState } from '../engine/stateManager';

const CRITIC_SYSTEM_PROMPT = `You are a Senior Copyeditor and SEO Expert reviewing a technical blog post draft.

Evaluate the draft against three criteria:

1. SEO Optimisation — natural keyword density, scannable H2/H3 header hierarchy, opening paragraph quality as an implicit meta description, internal linking opportunities flagged.
2. Structural Readability — logical section flow, heading frequency (one H2 per 300–400 words), effective use of bullet and numbered lists, paragraph length (target ≤5 sentences each).
3. Engagement — strength of the opening hook, tone calibrated to audience, specificity of actionable takeaways, absence of filler phrases ("it's worth noting", "in conclusion", "in summary").

Return ONLY a valid JSON object — no markdown fences, no prose before or after:
{
  "score": <integer 0–100>,
  "feedback": [<one actionable critique per issue>],
  "requiresRevision": <true if score < 75 or a critical structural flaw is present, else false>
}

Rules for feedback items:
- Each string must cite a specific heading, paragraph, or sentence pattern in the draft.
- Each string must state the exact change required, not just describe the problem.
- Maximum 6 feedback items. Omit minor style preferences.
- If the draft scores ≥ 75, feedback may list 1–2 small polish notes only.`;

/**
 * Parses the LLM's JSON response defensively.
 * Falls back to a "requires revision" report if output is malformed.
 */
function parseCritiqueResponse(raw: string): CritiqueReport {
  const stripped = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return {
      score: 0,
      feedback: [`Critic returned unparseable JSON — raw: ${raw.slice(0, 300)}`],
      requiresRevision: true,
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { score: 0, feedback: ['Critic JSON was not an object.'], requiresRevision: true };
  }

  const obj = parsed as Record<string, unknown>;
  const score =
    typeof obj.score === 'number' ? Math.max(0, Math.min(100, Math.round(obj.score))) : 0;
  const feedback = Array.isArray(obj.feedback)
    ? (obj.feedback as unknown[]).filter((f): f is string => typeof f === 'string')
    : ['No structured feedback returned by critic.'];
  const requiresRevision =
    typeof obj.requiresRevision === 'boolean' ? obj.requiresRevision : score < 75;

  return { score, feedback, requiresRevision };
}

/**
 * Sends the current draft to a critic LLM and returns a structured report.
 *
 * The critic runs on `config.anthropic.criticModel` (default: claude-3-5-sonnet-20241022)
 * and evaluates SEO optimisation, structural readability, and engagement.
 * The report is persisted to state and returned alongside the updated state.
 */
export async function criticNode(
  state: BlogState
): Promise<{ state: BlogState; report: CritiqueReport }> {
  console.log('  → Running critic review...');

  if (!state.draftMarkdown) {
    throw new Error('criticNode: state has no draftMarkdown — run draftNode first.');
  }

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: config.anthropic.criticModel,
      max_tokens: 1024,
      system: CRITIC_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please critique the following blog post draft:\n\n${state.draftMarkdown}`,
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status === 429) {
      throw new Error(
        `Critic LLM rate-limited (HTTP 429). Wait a moment before retrying the pipeline.\n` +
          `Original error: ${err.message}`
      );
    }
    throw err;
  }

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Critic LLM returned an unexpected non-text response block.');
  }

  const report = parseCritiqueResponse(block.text);

  // Append this cycle's report to the running critique history.
  const updatedHistory = [...(state.critiqueHistory ?? []), JSON.stringify(report)];
  const updated: BlogState = {
    ...state,
    critiqueReport: report,
    critiqueHistory: updatedHistory,
  };
  await upsertState(updated);

  const badge = report.requiresRevision ? '⚠  requires revision' : '✓  approved';
  console.log(`  Critic score: ${report.score}/100 — ${badge}`);
  report.feedback.forEach((f) => console.log(`    • ${f}`));

  return { state: updated, report };
}
