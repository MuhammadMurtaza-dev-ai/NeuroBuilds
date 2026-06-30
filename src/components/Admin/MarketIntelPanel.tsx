import { useEffect, useState, useCallback } from 'react';
import { auth } from '../../Firebase';

const AI_SERVICE =
  (import.meta.env.VITE_AI_SERVICE_URL as string | undefined) ?? 'http://localhost:8000';

interface CategoryStat {
  category: string;
  activeCount: number;
  newCount24h: number;
  priceMin: number;
  priceMax: number;
  priceMedian: number;
  priceAvg: number;
}
interface HotItem { title: string; category: string; price: number; velocity: number }
interface DeadItem { title: string; category: string; price: number; ageDays: number }
interface PriceMovement {
  category: string;
  previousMedian: number;
  currentMedian: number;
  deltaPct: number;
  direction: 'up' | 'down' | 'stable';
}
interface Snapshot {
  createdAt: string;
  windowStart: string;
  windowEnd: string;
  generatedBy: string;
  newCount24h: number;
  activeCount: number;
  categories: CategoryStat[];
  hot: HotItem[];
  dead: DeadItem[];
  priceMovements: PriceMovement[];
  summary: string;
}

const rs = (n: number) => `Rs ${n.toLocaleString('en-US')}`;

export default function MarketIntelPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeader = async (): Promise<Record<string, string>> => {
    const current = auth.currentUser;
    if (!current) throw new Error('Your session expired. Please sign in again.');
    const idToken = await current.getIdToken();
    return { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
  };

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const resp = await fetch(`${AI_SERVICE}/api/admin/market-intel/latest`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) throw new Error(`Failed to load snapshot (${resp.status})`);
      const data = await resp.json();
      setSnapshot(data.snapshot ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load market intelligence.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  const runAnalysis = async () => {
    setRunning(true);
    setError(null);
    try {
      const headers = await authHeader();
      const resp = await fetch(`${AI_SERVICE}/api/admin/market-intel/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mock }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => null);
        throw new Error(detail?.detail ?? `Analysis failed (${resp.status})`);
      }
      const data = await resp.json();
      setSnapshot(data.snapshot ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Market Intelligence</h2>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">
            Weekly GenAI analysis of hot products, price movements &amp; stale inventory
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mock}
              onChange={e => setMock(e.target.checked)}
              className="accent-accent-purple w-4 h-4"
            />
            Mock mode
          </label>
          <button
            onClick={runAnalysis}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-purple/10 border border-accent-purple/30 text-accent-purple text-sm font-bold hover:bg-accent-purple/20 transition-colors disabled:opacity-40"
          >
            <span className={`material-symbols-outlined text-[16px] ${running ? 'animate-spin' : ''}`}>
              {running ? 'progress_activity' : 'insights'}
            </span>
            {running ? 'Analysing…' : 'Run Analysis Now'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <span className="material-symbols-outlined text-base leading-none">error</span>
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />)}
        </div>
      ) : !snapshot ? (
        <div className="glass-panel rounded-bento border border-white/10 p-10 text-center">
          <span className="material-symbols-outlined text-gray-600 text-5xl mb-3 block">query_stats</span>
          <p className="text-gray-500 text-sm">
            No market snapshot yet. Run the analysis to generate the first one.
          </p>
        </div>
      ) : (
        <>
          {/* Meta strip */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-gray-500">
            <span>
              Generated{' '}
              <span className="text-gray-300">{new Date(snapshot.createdAt).toLocaleString()}</span>
            </span>
            <span className="px-2 py-0.5 rounded border border-white/10 text-gray-400 uppercase">
              {snapshot.generatedBy}
            </span>
            <span>New (24h): <span className="text-primary">{snapshot.newCount24h}</span></span>
            <span>Active: <span className="text-primary">{snapshot.activeCount}</span></span>
          </div>

          {/* Summary */}
          {snapshot.summary && (
            <div className="glass-panel rounded-bento border border-accent-purple/20 p-5">
              <p className="text-xs font-bold text-accent-purple font-mono uppercase tracking-widest mb-2">
                AI Market Brief
              </p>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                {snapshot.summary}
              </p>
            </div>
          )}

          {/* Price movements */}
          <Card title="Price Movements (week-over-week median)" icon="trending_up">
            {snapshot.priceMovements.length === 0 ? (
              <Empty text="No prior snapshot to compare against yet." />
            ) : (
              <div className="space-y-2">
                {snapshot.priceMovements.map(m => {
                  const up = m.direction === 'up';
                  const down = m.direction === 'down';
                  const colour = up ? 'text-red-400' : down ? 'text-green-400' : 'text-gray-400';
                  return (
                    <div key={m.category} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 capitalize text-gray-300">{m.category}</span>
                      <span className={`flex items-center gap-1 font-mono font-bold ${colour}`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {up ? 'arrow_upward' : down ? 'arrow_downward' : 'remove'}
                        </span>
                        {m.deltaPct > 0 ? '+' : ''}{m.deltaPct}%
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {rs(m.previousMedian)} → {rs(m.currentMedian)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Hot + Dead */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Hot Products (demand velocity)" icon="local_fire_department">
              {snapshot.hot.length === 0 ? (
                <Empty text="No standout movers this cycle." />
              ) : (
                <ul className="space-y-2">
                  {snapshot.hot.map((h, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <span className="text-amber-400 font-mono text-xs w-5 shrink-0">#{i + 1}</span>
                      <span className="flex-1 min-w-0 truncate text-gray-200">{h.title}</span>
                      <span className="text-xs text-gray-500 font-mono shrink-0">{rs(h.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Stale Inventory (dead listings)" icon="ac_unit">
              {snapshot.dead.length === 0 ? (
                <Empty text="No stale inventory detected." />
              ) : (
                <ul className="space-y-2">
                  {snapshot.dead.map((d, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <span className="flex-1 min-w-0 truncate text-gray-200">{d.title}</span>
                      <span className="text-xs text-gray-500 font-mono shrink-0">{rs(d.price)}</span>
                      <span className="text-xs text-gray-600 font-mono shrink-0">{d.ageDays}d old</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Category price ranges */}
          <Card title="Category Price Ranges (active listings)" icon="category">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-mono text-gray-500 uppercase tracking-wider text-left">
                    <th className="pb-2 pr-4 font-normal">Category</th>
                    <th className="pb-2 pr-4 font-normal text-right">Active</th>
                    <th className="pb-2 pr-4 font-normal text-right">New 24h</th>
                    <th className="pb-2 pr-4 font-normal text-right">Min</th>
                    <th className="pb-2 pr-4 font-normal text-right">Median</th>
                    <th className="pb-2 pr-4 font-normal text-right">Max</th>
                    <th className="pb-2 font-normal text-right">Avg Views</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {snapshot.categories.map(c => (
                    <tr key={c.category} className="border-t border-white/5">
                      <td className="py-2 pr-4 capitalize">{c.category}</td>
                      <td className="py-2 pr-4 text-right font-mono">{c.activeCount}</td>
                      <td className="py-2 pr-4 text-right font-mono text-primary">{c.newCount24h}</td>
                      <td className="py-2 pr-4 text-right font-mono text-gray-500">{rs(c.priceMin)}</td>
                      <td className="py-2 pr-4 text-right font-mono">{rs(c.priceMedian)}</td>
                      <td className="py-2 pr-4 text-right font-mono text-gray-500">{rs(c.priceMax)}</td>
                      <td className="py-2 text-right font-mono">{c.avgViews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-bento border border-white/10 p-5">
      <p className="flex items-center gap-2 text-xs font-bold text-gray-400 font-mono uppercase tracking-widest mb-4">
        <span className="material-symbols-outlined text-[16px] text-primary/70">{icon}</span>
        {title}
      </p>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-600">{text}</p>;
}
