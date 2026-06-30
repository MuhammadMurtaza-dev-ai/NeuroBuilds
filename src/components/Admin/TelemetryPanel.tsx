import { useEffect, useState, useCallback } from 'react';
import { telemetry } from '../../utils/telemetryTracker';
import type {
  TelemetryMetrics,
  ValidationCheckType,
  AIRequestEvent,
  CacheEvent,
  ValidationEvent,
} from '../../utils/telemetryTracker';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHECK_LABELS: Record<ValidationCheckType, string> = {
  socket_mismatch: 'Socket Mismatch',
  psu_margin:      'PSU Power Deficit',
  bios_flash:      'BIOS Flash Advisory',
  ram_mismatch:    'RAM Type Conflict',
  bottleneck:      'Component Bottleneck',
  upgrade_path:    'Limited Upgrade Path',
  budget_exceeded: 'Budget Exceeded',
};

const CHECK_SEVERITY: Record<ValidationCheckType, 'error' | 'warning'> = {
  socket_mismatch: 'error',
  psu_margin:      'error',
  ram_mismatch:    'error',
  bios_flash:      'warning',
  bottleneck:      'warning',
  upgrade_path:    'warning',
  budget_exceeded: 'warning',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HitRatioBar({ hits, total }: { hits: number; total: number }) {
  const pct = total > 0 ? Math.round((hits / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-mono text-gray-400 mb-1.5">
        <span className="text-primary">{pct}%</span>
        <span>{hits} hits / {total} req</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      <p className="text-xs text-gray-600 mt-1">{sub}</p>
    </div>
  );
}

type SortedEvent =
  | { ts: number; kind: 'ai';         e: AIRequestEvent }
  | { ts: number; kind: 'cache';      e: CacheEvent }
  | { ts: number; kind: 'validation'; e: ValidationEvent };

function EventRow({ item }: { item: SortedEvent }) {
  const time = new Date(item.ts).toLocaleTimeString();
  return (
    <div className="flex items-start gap-3 text-xs font-mono py-1.5 border-b border-white/5 last:border-0">
      <span className="text-gray-600 shrink-0 tabular-nums">{time}</span>
      {item.kind === 'ai' && (
        <>
          <span className="text-primary shrink-0">[AI]</span>
          <span className="text-gray-300 truncate">
            {item.e.isMockFallback ? '<MOCK> ' : ''}
            {fmtMs(item.e.totalDurationMs)} · &quot;{item.e.promptSnippet}&quot;
          </span>
        </>
      )}
      {item.kind === 'cache' && (
        <>
          <span className={item.e.hit ? 'text-green-400 shrink-0' : 'text-orange-400 shrink-0'}>
            [{item.e.cacheType.toUpperCase()} {item.e.hit ? 'HIT' : 'MISS'}]
          </span>
          <span className="text-gray-500 truncate">{item.e.key}</span>
        </>
      )}
      {item.kind === 'validation' && (
        <>
          <span className={item.e.severity === 'error' ? 'text-red-400 shrink-0' : 'text-yellow-400 shrink-0'}>
            [{item.e.severity.toUpperCase()}]
          </span>
          <span className="text-gray-300">{item.e.detail}</span>
        </>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function TelemetryPanel() {
  const [metrics, setMetrics] = useState<TelemetryMetrics>(() => telemetry.getMetrics());
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setMetrics(telemetry.getMetrics()), 2000);
    return () => clearInterval(id);
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([telemetry.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neurobuilds-telemetry-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleClear = useCallback(() => {
    if (confirmClear) {
      telemetry.clear();
      setMetrics(telemetry.getMetrics());
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
    }
  }, [confirmClear]);

  const { session, ai, cache, validation, raw } = metrics;

  const sortedEvents: SortedEvent[] = [
    ...raw.aiRequests.map(e => ({ ts: e.startedAt, kind: 'ai' as const, e })),
    ...raw.cacheEvents.map(e => ({ ts: e.timestamp, kind: 'cache' as const, e })),
    ...raw.validationEvents.map(e => ({ ts: e.timestamp, kind: 'validation' as const, e })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 25);

  const catchRows = (
    Object.entries(validation.byCheckType) as [ValidationCheckType, number][]
  ).filter(([, n]) => n > 0).sort(([, a], [, b]) => b - a);

  return (
    <div className="space-y-6">
      {/* Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Performance Telemetry</h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5">
            Session: {fmtDuration(session.durationMs)} · auto-refreshes every 2 s
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border border-primary/30 text-primary hover:bg-primary/10 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export JSON
          </button>
          <button
            onClick={handleClear}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border transition-all ${
              confirmClear
                ? 'border-red-500/50 text-red-400 bg-red-500/10'
                : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
            {confirmClear ? 'Confirm Clear?' : 'Clear Data'}
          </button>
        </div>
      </div>

      {/* AI Performance ──────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-bento border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="material-symbols-outlined text-primary">smart_toy</span>
          <h3 className="font-bold text-white">AI Request Performance</h3>
          <span className="ml-auto text-xs font-mono text-gray-500">
            {ai.totalRequests} request{ai.totalRequests !== 1 ? 's' : ''}
          </span>
        </div>
        {ai.totalRequests === 0 ? (
          <p className="text-sm text-gray-500 font-mono">
            No AI requests yet — send a message on the Chat page to populate metrics.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              label="Avg Latency"
              value={fmtMs(ai.avgLatencyMs)}
              sub="end-to-end"
              color="text-primary"
            />
            <StatCard
              label="Avg TTFT"
              value={ai.avgTimeToFirstTokenMs !== null ? fmtMs(ai.avgTimeToFirstTokenMs) : '—'}
              sub="first token"
              color="text-cyan-400"
            />
            <StatCard
              label="P95 Latency"
              value={fmtMs(ai.p95LatencyMs)}
              sub="95th percentile"
              color="text-yellow-400"
            />
            <StatCard
              label="Mock Rate"
              value={`${Math.round(ai.mockFallbackRate * 100)}%`}
              sub="fallback usage"
              color={ai.mockFallbackRate > 0 ? 'text-orange-400' : 'text-green-400'}
            />
            <StatCard
              label="Avg Output"
              value={ai.avgCharacterCount.toLocaleString()}
              sub="chars / response"
              color="text-gray-300"
            />
          </div>
        )}
      </div>

      {/* Cache Performance ───────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-bento border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="material-symbols-outlined text-accent-purple">cached</span>
          <h3 className="font-bold text-white">Cache Performance</h3>
          <span className="ml-auto text-xs font-mono text-gray-500">
            Overall {Math.round(cache.overall.hitRatio * 100)}% hit rate
            ({cache.overall.hits}/{cache.overall.hits + cache.overall.misses} req)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(
            [
              { label: 'YouTube Reviews', icon: 'smart_display', iconColor: 'text-red-400', data: cache.youtube, note: 'Component review videos in listing/build pages' },
              { label: 'GNews Headlines', icon: 'newspaper', iconColor: 'text-blue-400', data: cache.gnews, note: 'Homepage community feed + country news fallback' },
            ] as { label: string; icon: string; iconColor: string; data: { hits: number; misses: number }; note: string }[]
          ).map(({ label, icon, iconColor, data, note }) => (
            <div key={label} className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className={`material-symbols-outlined text-[18px] ${iconColor}`}>{icon}</span>
                <p className="text-sm font-bold text-white">{label}</p>
              </div>
              <p className="text-[10px] text-gray-600 font-mono mb-3">{note}</p>
              {data.hits + data.misses === 0 ? (
                <p className="text-xs text-gray-500 font-mono">No requests recorded yet</p>
              ) : (
                <HitRatioBar hits={data.hits} total={data.hits + data.misses} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Validation Catches ──────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-bento border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="material-symbols-outlined text-yellow-400">verified_user</span>
          <h3 className="font-bold text-white">Compatibility Validation Catches</h3>
          <div className="ml-auto flex gap-4 text-xs font-mono">
            <span className="text-red-400">{validation.errorCount} err</span>
            <span className="text-yellow-400">{validation.warningCount} warn</span>
            <span className="text-gray-400">{validation.totalCaught} total</span>
          </div>
        </div>
        {catchRows.length === 0 ? (
          <p className="text-sm text-gray-500 font-mono">
            No validations triggered yet. Validation data is parsed automatically from AI build responses.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-xs font-mono text-gray-500 pb-2 pr-6">Check Type</th>
                  <th className="text-center text-xs font-mono text-gray-500 pb-2 pr-6">Count</th>
                  <th className="text-left text-xs font-mono text-gray-500 pb-2">Severity</th>
                </tr>
              </thead>
              <tbody>
                {catchRows.map(([type, count]) => (
                  <tr key={type} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-6 font-mono text-white">{CHECK_LABELS[type]}</td>
                    <td className="py-2.5 pr-6 text-center">
                      <span className="px-2.5 py-0.5 rounded bg-white/10 font-mono font-bold text-white">
                        {count}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                        CHECK_SEVERITY[type] === 'error'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {CHECK_SEVERITY[type].toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Event Log ────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-bento border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-gray-400">history</span>
          <h3 className="font-bold text-white">Recent Event Log</h3>
          <span className="ml-auto text-xs font-mono text-gray-600">last 25 events</span>
        </div>
        <div className="max-h-64 overflow-y-auto pr-1 space-y-0">
          {sortedEvents.length === 0 ? (
            <p className="text-sm text-gray-500 font-mono text-center py-8">
              No events recorded this session.
            </p>
          ) : (
            sortedEvents.map((item, i) => <EventRow key={i} item={item} />)
          )}
        </div>
      </div>
    </div>
  );
}
