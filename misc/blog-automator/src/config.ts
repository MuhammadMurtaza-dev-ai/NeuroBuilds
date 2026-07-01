import dotenv from 'dotenv';
import path from 'path';

// Load .env relative to the blog-automator directory, not the caller's cwd.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export const config = {
  tavily: {
    apiKey: process.env.TAVILY_API_KEY ?? '',
    endpoint: 'https://api.tavily.com/search',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
    criticModel: process.env.CLAUDE_CRITIC_MODEL ?? 'claude-3-5-sonnet-20241022',
  },
  cms: {
    apiUrl: process.env.CMS_API_URL ?? 'http://localhost:2368/ghost/api/admin',
    apiKey: process.env.CMS_API_KEY ?? '',
  },
} as const;

/**
 * Throws with a descriptive message if required keys are absent.
 * In mock mode, API keys are not required.
 */
export function validateConfig(mock: boolean): void {
  if (mock) return;

  const missing: string[] = [];
  if (!config.tavily.apiKey) missing.push('TAVILY_API_KEY');
  if (!config.anthropic.apiKey) missing.push('ANTHROPIC_API_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        `Copy .env.example to .env and fill in the values.`
    );
  }
}
