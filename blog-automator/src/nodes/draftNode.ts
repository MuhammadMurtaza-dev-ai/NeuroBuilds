import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { BlogState } from '../types';
import { upsertState } from '../engine/stateManager';

const SYSTEM_PROMPT = `You are an expert technical blog writer specialising in SEO-optimised, long-form content. \
You write comprehensive, authoritative posts that are firmly grounded in provided research.

Requirements:
- Target 1,500–2,500 words of flowing prose
- Use H2 and H3 markdown headings to create a clear structure
- Open with an engaging introduction that frames the problem and earns the reader's attention
- Present main points with depth, concrete examples, and figures sourced from the research
- Use bullet points and numbered lists where they genuinely aid comprehension
- Close with a conclusion that distils actionable takeaways
- Do NOT invent statistics or quotes — only reference figures present in the provided research
- Output ONLY the blog post markdown — no preamble, meta-commentary, or word count annotations`;

/**
 * Generates or revises a blog draft.
 *
 * @param state    Current pipeline state (must have `researchData`).
 * @param feedback Critic feedback items from a prior iteration. When supplied,
 *                 the previous draft is included and the LLM revises rather
 *                 than writes from scratch.
 */
export async function draftNode(state: BlogState, feedback?: string[]): Promise<BlogState> {
  const isRevision = feedback !== undefined && feedback.length > 0;
  console.log(`  → ${isRevision ? 'Revising draft with critic feedback' : 'Generating draft'} with Claude...`);

  if (!state.researchData) {
    throw new Error('draftNode requires researchData — run researchNode first.');
  }

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  let userMessage: string;

  if (isRevision && state.draftMarkdown) {
    userMessage = [
      `Topic: ${state.topic}`,
      '',
      '## Research Data',
      state.researchData,
      '',
      '## Previous Draft',
      state.draftMarkdown,
      '',
      '## Critic Feedback (address every item in your revision)',
      ...feedback.map((f, i) => `${i + 1}. ${f}`),
      '',
      'Revise the previous draft to address all critic feedback above. ' +
        'Preserve every strength of the original; fix only what the feedback identifies. ' +
        'Output ONLY the revised blog post markdown.',
    ].join('\n');
  } else {
    userMessage = [
      `Topic: ${state.topic}`,
      '',
      '## Research Data',
      state.researchData,
      '',
      'Write a complete, publication-ready blog post on this topic using the research above.',
    ].join('\n');
  }

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status === 429) {
      throw new Error(
        `Writer LLM rate-limited (HTTP 429). Wait a moment before retrying the pipeline.\n` +
          `Original error: ${err.message}`
      );
    }
    throw err;
  }

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Claude returned an unexpected non-text response block.');
  }

  const draftMarkdown = block.text.trim();
  if (draftMarkdown.length < 200) {
    throw new Error(`Draft suspiciously short (${draftMarkdown.length} chars) — check model output.`);
  }

  const updated: BlogState = { ...state, draftMarkdown };
  await upsertState(updated);

  console.log(`  ✓ Draft generated (${draftMarkdown.length.toLocaleString()} chars)`);
  return updated;
}
