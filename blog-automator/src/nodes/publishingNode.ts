import axios, { AxiosError } from 'axios';
import { config } from '../config';
import type { BlogState, PublishResult } from '../types';
import { upsertState } from '../engine/stateManager';

/** Extracts the first H1 heading from the markdown as the post title. */
function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? 'Untitled Post';
}

/**
 * Sends a POST to the configured CMS REST API.
 * Falls back to a safe simulation when no real API key is configured.
 */
async function postToCMS(state: BlogState): Promise<PublishResult> {
  const title = extractTitle(state.draftMarkdown ?? '');
  const publishedAt = new Date().toISOString();

  // ── Simulation mode (no real CMS configured) ──────────────────────────────
  if (!config.cms.apiKey) {
    console.log(chalk_yellow('  ℹ  No CMS_API_KEY set — running publish simulation'));
    await new Promise((r) => setTimeout(r, 600)); // simulate network latency
    const mockId = `sim-${Date.now()}`;
    return {
      success: true,
      postId: mockId,
      url: `${config.cms.apiUrl}/posts/${mockId}`,
      publishedAt,
    };
  }

  // ── Ghost Admin API ───────────────────────────────────────────────────────
  const response = await axios.post<{ posts: Array<{ id: string; url: string }> }>(
    `${config.cms.apiUrl}/posts/`,
    {
      posts: [
        {
          title,
          status: 'published',
          published_at: publishedAt,
          // Ghost accepts plain markdown via the `markdown` card in mobiledoc:
          mobiledoc: JSON.stringify({
            version: '0.3.1',
            atoms: [],
            cards: [['markdown', { markdown: state.draftMarkdown }]],
            markups: [],
            sections: [[10, 0]],
          }),
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Ghost ${config.cms.apiKey}`,
      },
      timeout: 15_000,
    }
  );

  const post = response.data.posts[0];
  if (!post) throw new Error('CMS returned an empty posts array');

  return { success: true, postId: post.id, url: post.url, publishedAt };
}

// Inline chalk-yellow to avoid a chalk import cycle when used inside the node.
function chalk_yellow(msg: string): string {
  return `\x1b[33m${msg}\x1b[0m`;
}

export async function publishingNode(state: BlogState): Promise<BlogState> {
  console.log('  → Publishing to CMS...');

  if (!state.draftMarkdown) {
    throw new Error('publishingNode: state has no draftMarkdown.');
  }

  try {
    const result = await postToCMS(state);

    const updated: BlogState = {
      ...state,
      status: 'completed',
      publishedAt: result.publishedAt,
    };
    await upsertState(updated);

    console.log('  ✓ Published successfully');
    if (result.url) console.log(`  ✓ URL: ${result.url}`);

    return updated;
  } catch (err) {
    if (err instanceof AxiosError) {
      const status = err.response?.status ?? 'network error';
      const detail = (err.response?.data as { message?: string })?.message ?? err.message;
      throw new Error(`CMS publish failed [${status}]: ${detail}`);
    }
    throw err;
  }
}
