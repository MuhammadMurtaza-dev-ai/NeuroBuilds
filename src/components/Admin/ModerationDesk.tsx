import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReports } from '../../hooks/useReports';
import type { Report } from '../../hooks/useReports';
import { useAdminModeration } from '../../hooks/useAdminModeration';
import { useAppeals } from '../../hooks/useAppeals';
import type { Timestamp } from 'firebase/firestore';

type FilterTab = 'open' | 'resolved' | 'all';

const SPAM_THRESHOLD = 3;

function formatDate(ts: Timestamp | null): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const TARGET_BADGE: Record<Report['targetType'], string> = {
  listing: 'bg-primary/20 text-primary border-primary/30',
  thread:  'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
  user:    'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function ModerationDesk() {
  const navigate = useNavigate();
  const { reports, loading, error, resolveReport, hideTarget } = useReports();
  const { setAccountStatus } = useAdminModeration();
  const { appeals, resolveAppeal } = useAppeals();
  const [filter, setFilter] = useState<FilterTab>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openAppeals = appeals.filter(a => a.status === 'open');

  // Spam detection: count open reports per targetId
  const spamMap = useMemo(() => {
    const counts = new Map<string, number>();
    reports.forEach(r => {
      if (r.status === 'open') counts.set(r.targetId, (counts.get(r.targetId) ?? 0) + 1);
    });
    return counts;
  }, [reports]);

  // Repeat offenders: targets with >= SPAM_THRESHOLD open reports (deduped)
  const repeatOffenders = useMemo(() => {
    const seen = new Set<string>();
    const offenders: Report[] = [];
    reports.forEach(r => {
      if (r.status === 'open' && (spamMap.get(r.targetId) ?? 0) >= SPAM_THRESHOLD && !seen.has(r.targetId)) {
        seen.add(r.targetId);
        offenders.push(r);
      }
    });
    return offenders;
  }, [reports, spamMap]);

  const handleReinstate = async (appealId: string, uid: string) => {
    setBusy(`appeal-${appealId}`);
    setActionError(null);
    try {
      await setAccountStatus(uid, 'active');
      await resolveAppeal(appealId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to re-enable account.');
    } finally {
      setBusy(null);
    }
  };

  const handleDismissAppeal = async (appealId: string) => {
    setBusy(`appeal-${appealId}`);
    try {
      await resolveAppeal(appealId);
    } finally {
      setBusy(null);
    }
  };

  const visible = reports.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const handleHide = async (report: Report) => {
    if (report.targetType === 'user') return;
    setBusy(`hide-${report.id}`);
    try {
      await hideTarget(report.targetId, report.targetType);
      await resolveReport(report.id);
    } finally {
      setBusy(null);
    }
  };

  const handleDisable = async (report: Report) => {
    if (!window.confirm(
      `Disable ${report.targetTitle}'s marketplace account? Their active listings will be hidden. They can still sign in to appeal.`,
    )) return;
    setBusy(`disable-${report.id}`);
    setActionError(null);
    try {
      await setAccountStatus(report.targetId, 'disabled', report.reason);
      await resolveReport(report.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to disable account.');
    } finally {
      setBusy(null);
    }
  };

  const handleResolve = async (reportId: string) => {
    setBusy(`resolve-${reportId}`);
    try {
      await resolveReport(reportId);
    } finally {
      setBusy(null);
    }
  };

  const handleViewTarget = (report: Report) => {
    if (report.targetType === 'listing') {
      navigate(`/marketplace?id=${report.targetId}`);
    } else if (report.targetType === 'thread') {
      navigate('/community', { state: { openThreadId: report.targetId } });
    } else if (report.targetType === 'user') {
      navigate(`/seller/${report.targetId}`);
    }
  };

  const TAB_LABELS: { key: FilterTab; label: string }[] = [
    { key: 'open',     label: 'Open' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'all',      label: 'All' },
  ];

  return (
    <div>
      {/* Open appeals from disabled users */}
      {openAppeals.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base leading-none">gavel</span>
            Account Appeals ({openAppeals.length})
          </h3>
          <div className="flex flex-col gap-2">
            {openAppeals.map(a => {
              const appealBusy = busy === `appeal-${a.id}`;
              return (
                <div key={a.id} className="glass-panel rounded-xl border border-amber-500/20 p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">{a.displayName || a.uid.slice(0, 8)}</p>
                    <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap break-words">{a.message}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleReinstate(a.id, a.uid)}
                      disabled={appealBusy}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50 flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[13px]">lock_open</span>
                      {appealBusy ? 'Working…' : 'Re-enable'}
                    </button>
                    <button
                      onClick={() => handleDismissAppeal(a.id)}
                      disabled={appealBusy}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Repeat offenders banner */}
      {repeatOffenders.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base leading-none">report</span>
            Repeat Offenders — {repeatOffenders.length} target{repeatOffenders.length !== 1 ? 's' : ''} with {SPAM_THRESHOLD}+ open reports
          </h3>
          <div className="flex flex-col gap-2">
            {repeatOffenders.map(r => {
              const count = spamMap.get(r.targetId) ?? 0;
              const anyBusy = busy === `hide-${r.id}` || busy === `disable-${r.id}` || busy === `resolve-${r.id}`;
              return (
                <div key={r.targetId} className="glass-panel rounded-xl border border-red-500/25 p-3 flex items-center gap-3">
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border font-mono bg-red-500/10 text-red-400 border-red-500/30">
                    🚩 ×{count}
                  </span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${TARGET_BADGE[r.targetType]}`}>
                    {r.targetType}
                  </span>
                  <span className="flex-1 text-sm text-white truncate">{r.targetTitle}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleViewTarget(r)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white/5 border border-white/15 text-gray-300 hover:text-white transition-all flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                      View
                    </button>
                    {r.targetType === 'user' ? (
                      <button
                        onClick={() => handleDisable(r)}
                        disabled={anyBusy}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[13px]">block</span>
                        Disable
                      </button>
                    ) : (
                      <button
                        onClick={() => handleHide(r)}
                        disabled={anyBusy}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-50 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                        Hide
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-6">
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
              filter === key
                ? 'bg-primary/10 text-primary border-primary/30 shadow-neon'
                : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
            }`}
          >
            {label}
            {key !== 'all' && (
              <span className="ml-1.5 font-mono">
                ({reports.filter((r) => r.status === key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 glass-panel rounded-xl animate-pulse border border-white/5" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm font-mono">{error}</p>
      )}
      {actionError && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
          <span className="material-symbols-outlined text-base leading-none">error</span>
          {actionError}
        </div>
      )}

      {/* Empty */}
      {!loading && visible.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="material-symbols-outlined text-5xl text-green-500/50 mb-3">shield</span>
          <p className="text-white font-bold">Platform is Clean</p>
          <p className="text-gray-500 text-sm mt-1">No {filter === 'all' ? '' : filter} reports.</p>
        </div>
      )}

      {/* Table */}
      {!loading && visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-mono text-gray-500 uppercase tracking-wider border-b border-white/5">
                <th className="pb-3 pr-4">Reporter</th>
                <th className="pb-3 pr-4">Reason</th>
                <th className="pb-3 pr-4">Target</th>
                <th className="pb-3 pr-4">Type</th>
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visible.map((report) => {
                const isResolved = report.status === 'resolved';
                const hideBusy = busy === `hide-${report.id}`;
                const resolveBusy = busy === `resolve-${report.id}`;
                const disableBusy = busy === `disable-${report.id}`;
                const anyBusy = hideBusy || resolveBusy || disableBusy;
                const reportCount = spamMap.get(report.targetId) ?? 0;
                const isSpam = reportCount >= SPAM_THRESHOLD;

                return (
                  <tr
                    key={report.id}
                    className={`transition-all ${isResolved ? 'opacity-40' : 'hover:bg-white/[2%]'}`}
                  >
                    <td className="py-3.5 pr-4 text-white text-xs">
                      {report.reporterName || report.reporterId.slice(0, 8)}
                    </td>
                    <td className={`py-3.5 pr-4 text-gray-400 text-xs max-w-[180px] truncate ${isResolved ? 'line-through' : ''}`}>
                      {report.reason}
                    </td>
                    <td className="py-3.5 pr-4 text-xs max-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        {isSpam && !isResolved && (
                          <span className="shrink-0 text-[10px] font-bold text-red-400" title={`${reportCount} open reports on this target`}>
                            🚩×{reportCount}
                          </span>
                        )}
                        <span className="text-gray-300 truncate">{report.targetTitle}</span>
                      </div>
                      {report.proofUrl && (
                        <a
                          href={report.proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 flex items-center gap-1 text-[10px] font-mono text-accent-purple/70 hover:text-accent-purple transition-colors"
                        >
                          <span className="material-symbols-outlined text-[11px]">image</span>
                          proof
                        </a>
                      )}
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${TARGET_BADGE[report.targetType]}`}>
                        {report.targetType}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 text-gray-500 text-[11px] font-mono whitespace-nowrap">
                      {formatDate(report.createdAt)}
                    </td>
                    <td className="py-3.5">
                      {isResolved ? (
                        <span className="text-[11px] font-mono text-green-500/60 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">check</span>
                          Resolved
                        </span>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* View target */}
                          <button
                            onClick={() => handleViewTarget(report)}
                            className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-white/5 border border-white/15 text-gray-300 hover:text-white transition-all flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                            View
                          </button>

                          {report.targetType === 'user' ? (
                            <button
                              onClick={() => handleDisable(report)}
                              disabled={anyBusy}
                              className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[13px]">block</span>
                              {disableBusy ? 'Disabling…' : 'Disable account'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleHide(report)}
                              disabled={anyBusy}
                              className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                              {hideBusy ? 'Hiding…' : `Hide ${report.targetType}`}
                            </button>
                          )}
                          <button
                            onClick={() => handleResolve(report.id)}
                            disabled={anyBusy}
                            className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50 flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            {resolveBusy ? 'Resolving…' : 'Resolve'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
