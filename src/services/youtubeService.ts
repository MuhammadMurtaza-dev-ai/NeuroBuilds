import { telemetry } from '../utils/telemetryTracker';

export interface VideoItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}

const AI_SERVICE_URL =
  (import.meta.env.VITE_AI_SERVICE_URL as string | undefined) ?? 'http://localhost:8000';

export async function fetchComponentReviews(componentName: string): Promise<VideoItem[]> {
  const key = componentName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const res = await fetch(
      `${AI_SERVICE_URL}/api/components/reviews?component=${encodeURIComponent(componentName)}`
    );
    if (!res.ok) {
      telemetry.recordCacheEvent({ cacheType: 'youtube', key, hit: false, timestamp: Date.now() });
      return [];
    }
    const hit = res.headers.get('X-Cache') === 'HIT';
    telemetry.recordCacheEvent({ cacheType: 'youtube', key, hit, timestamp: Date.now() });
    return res.json();
  } catch {
    telemetry.recordCacheEvent({ cacheType: 'youtube', key, hit: false, timestamp: Date.now() });
    return [];
  }
}
