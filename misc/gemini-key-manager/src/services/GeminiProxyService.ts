import { GoogleGenAI } from '@google/genai';
import { KeyRotationManager } from './KeyRotationManager';
import { EmbeddingResult, TextGenerationResult } from '../types';

const DEFAULT_TEXT_MODEL = 'gemini-2.0-flash';
const EMBEDDING_MODEL = 'text-embedding-004';

/** Extracts a cooldown duration from the error if the SDK surfaces Retry-After. */
function parseCooldownMs(err: unknown): number {
  const DEFAULT = 60_000;
  try {
    const msg = (err as { message?: string }).message ?? '';
    const match = msg.match(/retry.?after[:\s]+(\d+)/i);
    if (match) return parseInt(match[1], 10) * 1000;
  } catch {
    // ignore parse errors
  }
  return DEFAULT;
}

function is429(err: unknown): boolean {
  const e = err as { status?: number; message?: string; code?: number };
  return (
    e.status === 429 ||
    e.code === 429 ||
    /429|quota|rate.?limit|resource.?exhausted/i.test(e.message ?? '')
  );
}

export class GeminiProxyService {
  private readonly manager: KeyRotationManager;

  constructor(manager: KeyRotationManager) {
    this.manager = manager;
  }

  /**
   * Generates text using the Gemini generative model.
   *
   * On a 429 the offending key is throttled and the call is transparently
   * retried with the next available key. The retry chain is bounded by the
   * total pool size to prevent infinite recursion.
   */
  async generateText(
    prompt: string,
    model: string = DEFAULT_TEXT_MODEL,
    attempt: number = 0,
  ): Promise<TextGenerationResult> {
    if (attempt >= this.manager.poolSize) {
      throw new Error(
        `generateText: all ${this.manager.poolSize} keys exhausted without a successful response.`,
      );
    }

    const startMs = Date.now();
    const key = this.manager.getAvailableKey();
    const keyId = this.manager.getKeyId(key);

    console.log(`  → [${keyId}] generateText attempt ${attempt + 1}/${this.manager.poolSize}`);

    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.text ?? '';
      const tokensUsed =
        (response.usageMetadata?.promptTokenCount ?? 0) +
        (response.usageMetadata?.candidatesTokenCount ?? 0);

      this.manager.recordSuccess(key, tokensUsed);

      return {
        text,
        model,
        keyId,
        tokensUsed,
        retryCount: attempt,
        durationMs: Date.now() - startMs,
      };
    } catch (err: unknown) {
      if (is429(err)) {
        console.warn(`  ⚠ [${keyId}] 429 rate-limit — rotating (attempt ${attempt + 1})`);
        this.manager.markThrottled(key, parseCooldownMs(err));
        return this.generateText(prompt, model, attempt + 1);
      }
      const msg = (err as Error).message ?? String(err);
      throw new Error(`generateText failed on ${keyId}: ${msg}`);
    }
  }

  /**
   * Generates a dense embedding vector for the given text using
   * `text-embedding-004`. Identical 429-rotation logic as generateText.
   */
  async getEmbeddings(text: string, attempt: number = 0): Promise<EmbeddingResult> {
    if (attempt >= this.manager.poolSize) {
      throw new Error(
        `getEmbeddings: all ${this.manager.poolSize} keys exhausted without a successful response.`,
      );
    }

    const startMs = Date.now();
    const key = this.manager.getAvailableKey();
    const keyId = this.manager.getKeyId(key);

    console.log(`  → [${keyId}] getEmbeddings attempt ${attempt + 1}/${this.manager.poolSize}`);

    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
      });

      const values: number[] = response.embeddings?.[0]?.values ?? [];
      this.manager.recordSuccess(key, values.length);

      return {
        values,
        model: EMBEDDING_MODEL,
        keyId,
        retryCount: attempt,
        durationMs: Date.now() - startMs,
      };
    } catch (err: unknown) {
      if (is429(err)) {
        console.warn(`  ⚠ [${keyId}] 429 rate-limit — rotating (attempt ${attempt + 1})`);
        this.manager.markThrottled(key, parseCooldownMs(err));
        return this.getEmbeddings(text, attempt + 1);
      }
      const msg = (err as Error).message ?? String(err);
      throw new Error(`getEmbeddings failed on ${keyId}: ${msg}`);
    }
  }
}
