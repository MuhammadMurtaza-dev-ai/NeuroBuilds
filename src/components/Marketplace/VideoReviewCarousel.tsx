import { useState } from 'react';
import type { VideoItem } from '../../services/youtubeService';

interface Props {
  videos: VideoItem[];
  loading: boolean;
  /** Component / product name used to build the YouTube deep-link fallback. */
  searchTerm?: string;
}

function SkeletonCard() {
  return (
    <div className="glass-panel rounded-[1.25rem] border border-white/10 overflow-hidden animate-pulse">
      <div className="aspect-video bg-white/5" />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-3 bg-white/10 rounded-full w-4/5" />
        <div className="h-3 bg-white/5 rounded-full w-2/5" />
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: VideoItem }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="glass-panel rounded-[1.25rem] border border-white/10 hover:border-primary/40 hover:shadow-neon transition-all duration-300 overflow-hidden group">
      {playing ? (
        <iframe
          className="aspect-video w-full"
          src={`https://www.youtube.com/embed/${video.videoId}?rel=0&modestbranding=1&autoplay=1`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="relative aspect-video w-full block overflow-hidden"
          aria-label={`Play ${video.title}`}
        >
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center shadow-[0_0_24px_rgba(13,242,242,0.5)]">
              <span className="material-symbols-outlined text-primary text-3xl leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>
                play_arrow
              </span>
            </div>
          </div>
          <div className="absolute bottom-2 right-2 bg-black/70 rounded-md px-1.5 py-0.5">
            <span className="text-[10px] text-red-400 font-bold tracking-wide uppercase">YouTube</span>
          </div>
        </button>
      )}
      <div className="p-3">
        <p className="text-xs font-semibold text-white leading-snug line-clamp-2">{video.title}</p>
        <p className="text-[11px] text-primary mt-1 truncate">{video.channelTitle}</p>
      </div>
    </div>
  );
}

export default function VideoReviewCarousel({ videos, loading, searchTerm }: Props) {
  const empty = !loading && videos.length === 0;

  return (
    <div className="px-6 pb-6 border-t border-white/5 pt-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm text-gray-400 uppercase tracking-wider">
        <span className="material-symbols-outlined text-primary leading-none">bolt</span>
        Trusted Technical Analysis Logs
      </h3>

      {empty ? (
        // Graceful degradation (SRS UC-04 A1): when the API returns no videos —
        // quota exhausted (HTTP 403), no key configured, or simply no matches —
        // fall back to a YouTube deep-link search instead of rendering nothing.
        <a
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
            `${searchTerm ?? ''} review`.trim(),
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-panel rounded-[1.25rem] border border-white/10 hover:border-primary/40 hover:shadow-neon transition-all duration-300 flex items-center gap-3 px-5 py-4 text-sm text-gray-300"
        >
          <span className="material-symbols-outlined text-red-400 leading-none">smart_display</span>
          <span>
            No cached reviews available.{' '}
            <span className="text-primary font-semibold">Search trusted reviews on YouTube →</span>
          </span>
        </a>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading
            ? [0, 1, 2].map(i => <SkeletonCard key={i} />)
            : videos.map(v => <VideoCard key={v.videoId} video={v} />)
          }
        </div>
      )}
    </div>
  );
}
