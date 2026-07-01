import { ApiKeyMetadata } from '../types';

const DEFAULT_COOLDOWN_MS = 60_000;
const WINDOW_DURATION_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

export class KeyRotationManager {
  private static instance: KeyRotationManager | undefined;

  private readonly registry: Map<string, ApiKeyMetadata> = new Map();
  private windowStart: number = Date.now();

  private constructor(keys: string[]) {
    if (keys.length === 0) {
      throw new Error('KeyRotationManager: at least one API key is required.');
    }
    keys.forEach((key, idx) => {
      this.registry.set(key, {
        id: `key_${String(idx + 1).padStart(2, '0')}`,
        key,
        status: 'healthy',
        requestsInCurrentWindow: 0,
        tokensInCurrentWindow: 0,
        throttledUntil: null,
        totalSuccessfulCalls: 0,
      });
    });
  }

  static getInstance(keys?: string[]): KeyRotationManager {
    if (!KeyRotationManager.instance) {
      if (!keys || keys.length === 0) {
        throw new Error('KeyRotationManager: provide keys on first initialization.');
      }
      KeyRotationManager.instance = new KeyRotationManager(keys);
    }
    return KeyRotationManager.instance;
  }

  /** Tear down the singleton — useful for test isolation. */
  static reset(): void {
    KeyRotationManager.instance = undefined;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private maybeResetWindow(): void {
    const now = Date.now();
    if (now - this.windowStart >= WINDOW_DURATION_MS) {
      this.windowStart = now;
      for (const meta of this.registry.values()) {
        meta.requestsInCurrentWindow = 0;
        meta.tokensInCurrentWindow = 0;
      }
    }
  }

  private evictExpiredThrottles(): void {
    const now = Date.now();
    for (const meta of this.registry.values()) {
      if (
        meta.status === 'throttled' &&
        meta.throttledUntil !== null &&
        now >= meta.throttledUntil
      ) {
        meta.status = 'healthy';
        meta.throttledUntil = null;
        meta.requestsInCurrentWindow = 0;
        meta.tokensInCurrentWindow = 0;
        console.log(`[KeyManager] ${meta.id} throttle expired — restored to healthy`);
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns the raw API key string for the healthiest, least-utilized key.
   * Applies a randomized shuffle among the lower-usage half to prevent
   * hot-spotting on a single key.
   *
   * Side-effect: increments `requestsInCurrentWindow` on the chosen key.
   */
  getAvailableKey(): string {
    this.maybeResetWindow();
    this.evictExpiredThrottles();

    const candidates = Array.from(this.registry.values()).filter(
      (m) => m.status === 'healthy' && m.requestsInCurrentWindow < MAX_REQUESTS_PER_WINDOW,
    );

    if (candidates.length === 0) {
      throw new Error('KeyRotationManager: all keys are throttled or exhausted.');
    }

    // Sort ascending by window usage, then randomly pick from the lower half
    candidates.sort((a, b) => a.requestsInCurrentWindow - b.requestsInCurrentWindow);
    const poolSize = Math.max(1, Math.ceil(candidates.length / 2));
    const pool = candidates.slice(0, poolSize);

    // Fisher-Yates shuffle on the candidate pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const chosen = pool[0];
    chosen.requestsInCurrentWindow++;
    return chosen.key;
  }

  /**
   * Flags a key as throttled and blocks it for `cooldownMs` milliseconds.
   * If the SDK response carried a `Retry-After` header value, pass it here.
   */
  markThrottled(key: string, cooldownMs: number = DEFAULT_COOLDOWN_MS): void {
    const meta = this.registry.get(key);
    if (!meta) return;
    meta.status = 'throttled';
    meta.throttledUntil = Date.now() + cooldownMs;
    console.warn(
      `[KeyManager] ${meta.id} marked throttled — blocked for ${cooldownMs / 1000}s`,
    );
  }

  /** Increments success counters after a confirmed successful SDK call. */
  recordSuccess(key: string, tokensUsed: number = 0): void {
    const meta = this.registry.get(key);
    if (!meta) return;
    meta.totalSuccessfulCalls++;
    meta.tokensInCurrentWindow += tokensUsed;
  }

  /** Returns a sanitized snapshot (keys redacted) for logging / dashboards. */
  getStats(): Omit<ApiKeyMetadata, 'key'>[] {
    return Array.from(this.registry.values()).map(({ key: _redacted, ...rest }) => rest);
  }

  /** Resolves a raw key string to its human-readable id (e.g. `key_01`). */
  getKeyId(key: string): string {
    return this.registry.get(key)?.id ?? 'unknown';
  }

  /** Total number of keys in the registry (healthy + throttled). */
  get poolSize(): number {
    return this.registry.size;
  }
}
