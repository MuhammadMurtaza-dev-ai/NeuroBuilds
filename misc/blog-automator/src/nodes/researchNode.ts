import axios, { AxiosError } from 'axios';
import { config } from '../config';
import type { BlogState, TavilyResponse, TavilyResult } from '../types';
import { upsertState } from '../engine/stateManager';

function formatResearch(results: TavilyResult[], answer?: string): string {
  const sections: string[] = [];

  if (answer) {
    sections.push(`## AI Summary\n${answer}`);
  }

  const sourceSection = results
    .slice(0, 5)
    .map((r, i) =>
      [
        `### [${i + 1}] ${r.title}`,
        `**URL:** ${r.url}`,
        `**Relevance:** ${(r.score * 100).toFixed(0)}%`,
        '',
        r.content,
      ].join('\n')
    )
    .join('\n\n---\n\n');

  sections.push(`## Source Articles\n\n${sourceSection}`);
  return sections.join('\n\n---\n\n');
}

export async function researchNode(state: BlogState): Promise<BlogState> {
  console.log(`  → Querying Tavily for: "${state.topic}"`);

  try {
    const response = await axios.post<TavilyResponse>(
      config.tavily.endpoint,
      {
        api_key: config.tavily.apiKey,
        query: state.topic,
        search_depth: 'advanced',
        include_answer: true,
        max_results: 5,
      },
      { timeout: 30_000 }
    );

    const { results, answer } = response.data;

    if (!results?.length) {
      throw new Error('Tavily returned zero results — try a more specific topic.');
    }

    const researchData = formatResearch(results, answer);
    const updated: BlogState = { ...state, researchData };
    await upsertState(updated);

    console.log(`  ✓ Gathered ${results.length} source(s)`);
    return updated;
  } catch (err) {
    if (err instanceof AxiosError) {
      const status = err.response?.status ?? 'network error';
      const detail = (err.response?.data as { message?: string })?.message ?? err.message;
      throw new Error(`Tavily API error [${status}]: ${detail}`);
    }
    throw err;
  }
}
