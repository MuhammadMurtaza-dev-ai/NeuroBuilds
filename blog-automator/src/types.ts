// ── Core domain types ────────────────────────────────────────────────────────

export type BlogStatus =
  | 'idle'
  | 'researching'
  | 'pending_approval'
  | 'approved'
  | 'publishing'
  | 'completed'
  | 'failed';

export interface CritiqueReport {
  /** Overall quality score from 0–100. */
  score: number;
  /** Specific, actionable feedback items from the critic LLM. */
  feedback: string[];
  /** True when score < 75 or a critical structural issue is present. */
  requiresRevision: boolean;
}

export interface BlogState {
  id: string;
  topic: string;
  researchData?: string;
  draftMarkdown?: string;
  status: BlogStatus;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  publishedAt?: string;
  /** Stores the previous draft text each time the user manually edits. */
  editHistory?: string[];
  /** The most recent automated critique produced by criticNode. */
  critiqueReport?: CritiqueReport;
  /** JSON-serialised CritiqueReport for each prior iteration, oldest first. */
  critiqueHistory?: string[];
  /** Number of draft+critique cycles that completed before pending_approval. */
  draftIteration?: number;
}

// ── Tavily API ───────────────────────────────────────────────────────────────

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

export interface TavilyResponse {
  query: string;
  answer?: string;
  results: TavilyResult[];
  response_time?: number;
}

// ── Publishing ───────────────────────────────────────────────────────────────

export interface PublishResult {
  success: boolean;
  postId?: string;
  url?: string;
  publishedAt: string;
}

// ── Pipeline options ─────────────────────────────────────────────────────────

export interface PipelineOptions {
  /** Use synthetic data — no real API calls made. */
  mock?: boolean;
  /** Skip the interactive HITL prompt (used by mock end-to-end run). */
  autoApprove?: boolean;
}
