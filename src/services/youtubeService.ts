import { telemetry } from '../utils/telemetryTracker';

export interface VideoItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}

interface CacheEntry {
  ts: number;
  videos: VideoItem[];
}

const CACHE_TTL = 24 * 60 * 60 * 1000;

function cacheKey(componentName: string): string {
  return `nb_yt_cache_${componentName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
}

export async function fetchComponentReviews(componentName: string): Promise<VideoItem[]> {
  const key = cacheKey(componentName);

  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const entry: CacheEntry = JSON.parse(raw);
      if (Date.now() - entry.ts < CACHE_TTL) {
        telemetry.recordCacheEvent({ cacheType: 'youtube', key, hit: true, timestamp: Date.now() });
        return entry.videos;
      }
    }
  } catch {
    // corrupted cache — fall through to network
  }

  telemetry.recordCacheEvent({ cacheType: 'youtube', key, hit: false, timestamp: Date.now() });

  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (!apiKey || apiKey === 'your_youtube_api_key_here') return [];

  const query = `${componentName} review (Gamers Nexus OR Hardware Unboxed OR Linus Tech Tips)`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=3&q=${encodeURIComponent(query)}&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const videos: VideoItem[] = (data.items ?? []).map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? '',
  }));

  try {
    const entry: CacheEntry = { ts: Date.now(), videos };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // sessionStorage full — skip caching
  }

  return videos;
}
