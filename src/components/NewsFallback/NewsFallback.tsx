import { useEffect, useState } from 'react';
import { COUNTRY_ISO } from '../../data/globalLocations';
import { telemetry } from '../../utils/telemetryTracker';

interface Article {
  title: string;
  description: string | null;
  url: string;
  image: string | null;
  publishedAt: string;
  source: { name: string; url: string };
}

interface Props {
  country: string;
  context: 'marketplace' | 'community';
}

const CONTEXT_LABEL: Record<Props['context'], string> = {
  marketplace: 'listings',
  community: 'threads',
};

export default function NewsFallback({ country, context }: Props) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isoCode = COUNTRY_ISO[country] ?? 'us';
  const apiKey = import.meta.env.VITE_GNEWS_API_KEY as string | undefined;

  useEffect(() => {
    if (!apiKey) {
      setFetchError('News API key not configured (VITE_GNEWS_API_KEY).');
      setLoading(false);
      return;
    }

    const CACHE_KEY = `gnews_cache_${isoCode}`;
    const CACHE_TTL = 24 * 60 * 60 * 1000;
    const RATE_LIMIT_TTL = 60 * 60 * 1000;

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as { articles: Article[]; timestamp: number; rateLimited?: boolean };
        const ttl = parsed.rateLimited ? RATE_LIMIT_TTL : CACHE_TTL;
        if (Date.now() - parsed.timestamp < ttl) {
          telemetry.recordCacheEvent({ cacheType: 'gnews', key: CACHE_KEY, hit: true, timestamp: Date.now() });
          if (parsed.rateLimited) {
            setFetchError('News temporarily unavailable — API rate limit reached. Try again later.');
          } else {
            setArticles(parsed.articles);
          }
          setLoading(false);
          return;
        }
      }
    } catch {
      // stale/corrupt cache — fall through to fetch
    }

    telemetry.recordCacheEvent({ cacheType: 'gnews', key: CACHE_KEY, hit: false, timestamp: Date.now() });

    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    fetch(
      `https://gnews.io/api/v4/top-headlines?country=${isoCode}&category=technology&lang=en&max=6&token=${apiKey}`
    )
      .then(r => {
        if (r.status === 429) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ articles: [], timestamp: Date.now(), rateLimited: true })); } catch { /* storage full */ }
          throw new Error('rate_limited');
        }
        if (!r.ok) throw new Error(`GNews API returned ${r.status}`);
        return r.json();
      })
      .then((data: { articles?: Article[] }) => {
        if (!cancelled) {
          const articles = data.articles ?? [];
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ articles, timestamp: Date.now() }));
          } catch { /* storage full — ignore */ }
          setArticles(articles);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setFetchError(
            err.message === 'rate_limited'
              ? 'News temporarily unavailable — API rate limit reached. Try again later.'
              : err.message
          );
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [isoCode, apiKey]);

  return (
    <div className="col-span-full">
      {/* Header banner */}
      <div className="glass-panel rounded-[1.5rem] border border-white/10 p-6 mb-6 flex items-center gap-4">
        <span className="material-symbols-outlined text-3xl text-primary shrink-0">travel_explore</span>
        <div>
          <p className="font-semibold text-white">
            No {CONTEXT_LABEL[context]} found in <span className="text-primary">{country}</span>
          </p>
          <p className="text-sm text-gray-400 mt-0.5">
            Showing trending tech headlines for this region instead.
          </p>
        </div>
      </div>

      {loading && (
        <div className="glass-panel rounded-[2rem] p-12 text-center border border-white/5">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin block mx-auto mb-3">
            progress_activity
          </span>
          <p className="text-gray-400 text-sm">Fetching news…</p>
        </div>
      )}

      {fetchError && !loading && (
        <div className="glass-panel rounded-[2rem] p-8 text-center border border-red-500/20">
          <span className="material-symbols-outlined text-4xl text-red-400 block mx-auto mb-3">
            error
          </span>
          <p className="text-red-400 text-sm">{fetchError}</p>
        </div>
      )}

      {!loading && !fetchError && articles.length === 0 && (
        <div className="glass-panel rounded-[2rem] p-12 text-center border border-white/5">
          <span className="material-symbols-outlined text-5xl text-gray-600 block mx-auto mb-3">
            newspaper
          </span>
          <p className="text-gray-400 text-sm">No headlines available for this region right now.</p>
        </div>
      )}

      {!loading && !fetchError && articles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map((article, i) => (
            <a
              key={i}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-panel rounded-[1.5rem] border border-white/5 overflow-hidden flex flex-col group hover:border-primary/30 hover:shadow-neon transition-all duration-300"
            >
              {article.image ? (
                <div className="aspect-[16/9] overflow-hidden bg-black/30">
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="aspect-[16/9] bg-gradient-to-br from-primary/5 to-accent-purple/5 flex items-center justify-center">
                  <span className="material-symbols-outlined text-4xl text-gray-700">newspaper</span>
                </div>
              )}
              <div className="p-4 flex flex-col flex-grow gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                  <span className="material-symbols-outlined text-[14px] text-primary">rss_feed</span>
                  {article.source.name}
                </div>
                <h3 className="text-sm font-semibold text-white leading-snug line-clamp-3 group-hover:text-primary transition-colors">
                  {article.title}
                </h3>
                {article.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mt-auto pt-1">
                    {article.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                  <span className="text-xs text-gray-600">
                    {new Date(article.publishedAt).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-primary flex items-center gap-1">
                    Read more
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
