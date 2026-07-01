import { useEffect, useMemo } from 'react';
import { useBlogFeed } from '../../hooks/useBlogCMS';
import { useCommunity, COMMUNITY_CATEGORIES } from '../../hooks/useCommunity';
import { useMarketplace } from '../../hooks/useMarketplace';

interface BarItem {
  label: string;
  value: number;
}

function PercentBar({ item, max, color }: { item: BarItem; max: number; color: string }) {
  const pct = max > 0 ? Math.round((item.value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-3 group">
      <span className="text-xs text-gray-400 w-20 sm:w-32 truncate shrink-0 font-mono" title={item.label}>
        {item.label}
      </span>
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-500 w-8 text-right shrink-0">{item.value}</span>
    </div>
  );
}

function AnalyticsCard({
  title,
  icon,
  items,
  color,
  loading,
  emptyMsg,
}: {
  title: string;
  icon: string;
  items: BarItem[];
  color: string;
  loading: boolean;
  emptyMsg: string;
}) {
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);

  return (
    <div className="glass-panel rounded-bento border border-white/10 p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined text-[20px] ${color.replace('bg-', 'text-').split('/')[0]}`}>
          {icon}
        </span>
        <h3 className="text-sm font-bold text-white uppercase tracking-widest font-mono">
          {title}
        </h3>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-3 bg-white/10 rounded w-24 shrink-0" />
              <div className="flex-1 h-2 bg-white/5 rounded-full" />
              <div className="h-3 bg-white/5 rounded w-6" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-gray-600 text-xs italic text-center py-4">{emptyMsg}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <PercentBar key={item.label} item={item} max={max} color={color} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { posts, loading: blogsLoading } = useBlogFeed(true);
  const { allThreads, loading: communityLoading } = useCommunity();
  const { listings, loading: marketLoading, fetchByScope } = useMarketplace();

  useEffect(() => { fetchByScope(); }, [fetchByScope]);

  // Most commented blogs — top 5
  const blogItems: BarItem[] = useMemo(() =>
    [...posts]
      .sort((a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0))
      .slice(0, 5)
      .map((p) => ({ label: p.title, value: p.commentCount ?? 0 })),
    [posts]);

  // Most upvoted community categories
  const communityItems: BarItem[] = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    allThreads.forEach((t) => {
      categoryMap[t.category] = (categoryMap[t.category] ?? 0) + t.upvoteCount;
    });
    return Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, votes]) => ({
        label: COMMUNITY_CATEGORIES.find((c) => c.id === cat)?.name ?? cat,
        value: votes,
      }));
  }, [allThreads]);

  // Most saved listing categories
  const marketItems: BarItem[] = useMemo(() => {
    const savedMap: Record<string, number> = {};
    listings.forEach((l) => {
      savedMap[l.category] = (savedMap[l.category] ?? 0) + (l.savedBy?.length ?? 0);
    });
    return Object.entries(savedMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, saves]) => ({ label: cat, value: saves }));
  }, [listings]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
      <AnalyticsCard
        title="Most Commented"
        icon="comment"
        items={blogItems}
        color="bg-primary/70"
        loading={blogsLoading}
        emptyMsg="No blog posts with comments yet."
      />
      <AnalyticsCard
        title="Top Categories"
        icon="trending_up"
        items={communityItems}
        color="bg-accent-purple/70"
        loading={communityLoading}
        emptyMsg="No community activity yet."
      />
      <AnalyticsCard
        title="Most Saved"
        icon="bookmark"
        items={marketItems}
        color="bg-amber-500/70"
        loading={marketLoading}
        emptyMsg="No saved listings yet."
      />
    </div>
  );
}
