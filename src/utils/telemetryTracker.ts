// ─── Event types ──────────────────────────────────────────────────────────────

export type ValidationCheckType =
  | 'socket_mismatch'
  | 'psu_margin'
  | 'bios_flash'
  | 'ram_mismatch'
  | 'bottleneck'
  | 'upgrade_path'
  | 'budget_exceeded';

export type CacheType = 'youtube' | 'gnews';

export interface AIRequestEvent {
  requestId: string;
  promptSnippet: string;
  startedAt: number;
  timeToFirstTokenMs: number | null;
  totalDurationMs: number;
  characterCount: number;
  isMockFallback: boolean;
}

export interface CacheEvent {
  cacheType: CacheType;
  key: string;
  hit: boolean;
  timestamp: number;
}

export interface ValidationEvent {
  checkType: ValidationCheckType;
  severity: 'error' | 'warning';
  detail: string;
  timestamp: number;
}

// ─── Internal log structure ───────────────────────────────────────────────────

interface TelemetryLog {
  aiRequests: AIRequestEvent[];
  cacheEvents: CacheEvent[];
  validationEvents: ValidationEvent[];
  sessionStart: number;
}

// ─── Computed metrics ─────────────────────────────────────────────────────────

export interface CacheBreakdown {
  hits: number;
  misses: number;
  hitRatio: number;
}

export interface TelemetryMetrics {
  session: { startedAt: number; durationMs: number };
  ai: {
    totalRequests: number;
    avgLatencyMs: number;
    avgTimeToFirstTokenMs: number | null;
    avgCharacterCount: number;
    mockFallbackRate: number;
    p95LatencyMs: number;
  };
  cache: {
    youtube: CacheBreakdown;
    gnews: CacheBreakdown;
    overall: CacheBreakdown;
  };
  validation: {
    totalCaught: number;
    errorCount: number;
    warningCount: number;
    byCheckType: Record<ValidationCheckType, number>;
  };
  raw: TelemetryLog;
}

// ─── Validation pattern detector ─────────────────────────────────────────────

interface ValidationPattern {
  pattern: RegExp;
  checkType: ValidationCheckType;
  severity: 'error' | 'warning';
  detail: string;
}

const VALIDATION_PATTERNS: ValidationPattern[] = [
  {
    pattern: /socket.{0,25}mismatch|incompatible.{0,10}socket|cpu.{0,20}socket.{0,20}(doesn't|does not|won't|will not).{0,20}fit/i,
    checkType: 'socket_mismatch',
    severity: 'error',
    detail: 'CPU/motherboard socket mismatch detected',
  },
  {
    pattern: /psu.{0,40}(insufficient|deficit|too low|not enough|underpowered|inadequate)|power supply.{0,30}(insufficient|too small|not enough)|\bpsu\b.{0,20}(can't|cannot|won't).{0,20}(support|handle|power)/i,
    checkType: 'psu_margin',
    severity: 'error',
    detail: 'PSU power budget deficit identified',
  },
  {
    pattern: /bios.{0,20}(update|flash|upgrade)|flash.{0,20}bios/i,
    checkType: 'bios_flash',
    severity: 'warning',
    detail: 'BIOS flash required for CPU compatibility',
  },
  {
    pattern: /ddr4.{0,40}ddr5|ddr5.{0,40}ddr4|memory.{0,20}type.{0,20}(mismatch|incompatible)|ram.{0,20}(incompatible|mismatch|wrong.{0,10}type)/i,
    checkType: 'ram_mismatch',
    severity: 'error',
    detail: 'RAM generation (DDR4/DDR5) incompatibility caught',
  },
  {
    pattern: /(\d+)\s*%.{0,30}bottleneck|bottleneck.{0,30}(\d+)\s*%|cpu.{0,20}bottleneck|gpu.{0,20}bottleneck/i,
    checkType: 'bottleneck',
    severity: 'warning',
    detail: 'Component performance bottleneck estimated',
  },
  {
    pattern: /upgrade.{0,30}(limited|poor|low|minimal|restricted|platform)|limited.{0,20}upgrade|upgrade.{0,15}path.{0,15}(concern|issue|warn)/i,
    checkType: 'upgrade_path',
    severity: 'warning',
    detail: 'Limited platform upgrade path flagged',
  },
  {
    pattern: /budget.{0,20}exceeded|over.{0,10}budget|exceeds.{0,20}budget|\$\d+.{0,20}over.{0,10}(budget|limit)|spending.{0,20}limit/i,
    checkType: 'budget_exceeded',
    severity: 'warning',
    detail: 'Build cost exceeds stated budget constraint',
  },
];

export function parseValidationsFromResponse(text: string): ValidationEvent[] {
  const now = Date.now();
  const events: ValidationEvent[] = [];
  const seen = new Set<ValidationCheckType>();

  for (const { pattern, checkType, severity, detail } of VALIDATION_PATTERNS) {
    if (!seen.has(checkType) && pattern.test(text)) {
      seen.add(checkType);
      events.push({ checkType, severity, detail, timestamp: now });
    }
  }

  return events;
}

// ─── Tracker singleton ────────────────────────────────────────────────────────

const STORAGE_KEY = 'nb_telemetry_v1';
const MAX_EVENTS = 100;

const ALL_CHECK_TYPES: ValidationCheckType[] = [
  'socket_mismatch', 'psu_margin', 'bios_flash', 'ram_mismatch',
  'bottleneck', 'upgrade_path', 'budget_exceeded',
];

function loadLog(): TelemetryLog {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TelemetryLog;
  } catch { /* corrupt — fall through */ }
  return { aiRequests: [], cacheEvents: [], validationEvents: [], sessionStart: Date.now() };
}

function saveLog(log: TelemetryLog): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch { /* storage full — skip */ }
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)];
}

function cacheBreakdown(events: CacheEvent[], type: CacheType): CacheBreakdown {
  const filtered = events.filter(e => e.cacheType === type);
  const hits = filtered.filter(e => e.hit).length;
  const total = filtered.length;
  return { hits, misses: total - hits, hitRatio: total > 0 ? hits / total : 0 };
}

class TelemetryTracker {
  private log: TelemetryLog;

  constructor() {
    this.log = loadLog();
  }

  recordAIRequest(event: AIRequestEvent): void {
    this.log.aiRequests = [...this.log.aiRequests.slice(-(MAX_EVENTS - 1)), event];
    saveLog(this.log);
  }

  recordCacheEvent(event: CacheEvent): void {
    this.log.cacheEvents = [...this.log.cacheEvents.slice(-(MAX_EVENTS - 1)), event];
    saveLog(this.log);
  }

  recordValidation(event: ValidationEvent): void {
    this.log.validationEvents = [...this.log.validationEvents.slice(-(MAX_EVENTS - 1)), event];
    saveLog(this.log);
  }

  getMetrics(): TelemetryMetrics {
    const { aiRequests, cacheEvents, validationEvents, sessionStart } = this.log;

    const durations = aiRequests.map(r => r.totalDurationMs);
    const ttfts = aiRequests.map(r => r.timeToFirstTokenMs).filter((v): v is number => v !== null);
    const chars = aiRequests.map(r => r.characterCount);
    const mockCount = aiRequests.filter(r => r.isMockFallback).length;

    const totalCacheHits = cacheEvents.filter(e => e.hit).length;

    const byCheckType = Object.fromEntries(
      ALL_CHECK_TYPES.map(t => [t, 0])
    ) as Record<ValidationCheckType, number>;
    let errorCount = 0;
    let warningCount = 0;
    for (const ev of validationEvents) {
      byCheckType[ev.checkType] = (byCheckType[ev.checkType] ?? 0) + 1;
      if (ev.severity === 'error') errorCount++;
      else warningCount++;
    }

    return {
      session: { startedAt: sessionStart, durationMs: Date.now() - sessionStart },
      ai: {
        totalRequests: aiRequests.length,
        avgLatencyMs: Math.round(avg(durations)),
        avgTimeToFirstTokenMs: ttfts.length ? Math.round(avg(ttfts)) : null,
        avgCharacterCount: Math.round(avg(chars)),
        mockFallbackRate: aiRequests.length ? mockCount / aiRequests.length : 0,
        p95LatencyMs: Math.round(percentile(durations, 95)),
      },
      cache: {
        youtube: cacheBreakdown(cacheEvents, 'youtube'),
        gnews: cacheBreakdown(cacheEvents, 'gnews'),
        overall: {
          hits: totalCacheHits,
          misses: cacheEvents.length - totalCacheHits,
          hitRatio: cacheEvents.length ? totalCacheHits / cacheEvents.length : 0,
        },
      },
      validation: {
        totalCaught: validationEvents.length,
        errorCount,
        warningCount,
        byCheckType,
      },
      raw: this.log,
    };
  }

  exportJSON(): string {
    return JSON.stringify(this.getMetrics(), null, 2);
  }

  clear(): void {
    this.log = { aiRequests: [], cacheEvents: [], validationEvents: [], sessionStart: Date.now() };
    saveLog(this.log);
  }
}

export const telemetry = new TelemetryTracker();
