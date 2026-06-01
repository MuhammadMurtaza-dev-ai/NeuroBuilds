import { useState } from 'react';
import { useReports } from '../../hooks/useReports';
import type { Report } from '../../hooks/useReports';
import type { Timestamp } from 'firebase/firestore';

type FilterTab = 'open' | 'resolved' | 'all';

function formatDate(ts: Timestamp | null): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const TARGET_BADGE: Record<Report['targetType'], string> = {
  listing: 'bg-primary/20 text-primary border-primary/30',
  thread:  'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
};

export default function ModerationDesk() {
  const { reports, loading, error, resolveReport, hideTarget } = useReports();
  const [filter, setFilter] = useState<FilterTab>('open');
  const [busy, setBusy] = useState<string | null>(null);

  const visible = reports.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const handleHide = async (report: Report) => {
    setBusy(`hide-${report.id}`);
    try {
      await hideTarget(report.targetId, report.targetType);
      await resolveReport(report.id);
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

  const TAB_LABELS: { key: FilterTab; label: string }[] = [
    { key: 'open',     label: 'Open' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'all',      label: 'All' },
  ];

  return (
    <div>
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
                    <td className="py-3.5 pr-4 text-gray-300 text-xs max-w-[160px] truncate">
                      {report.targetTitle}
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleHide(report)}
                            disabled={hideBusy || resolveBusy}
                            className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-50 flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                            {hideBusy ? 'Hiding…' : `Hide ${report.targetType}`}
                          </button>
                          <button
                            onClick={() => handleResolve(report.id)}
                            disabled={hideBusy || resolveBusy}
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
