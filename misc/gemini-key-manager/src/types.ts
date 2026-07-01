export interface ApiKeyMetadata {
  id: string;
  key: string;
  status: 'healthy' | 'throttled';
  requestsInCurrentWindow: number;
  tokensInCurrentWindow: number;
  throttledUntil: number | null;
  totalSuccessfulCalls: number;
}

export interface TextGenerationResult {
  text: string;
  model: string;
  keyId: string;
  tokensUsed: number;
  retryCount: number;
  durationMs: number;
}

export interface EmbeddingResult {
  values: number[];
  model: string;
  keyId: string;
  retryCount: number;
  durationMs: number;
}
