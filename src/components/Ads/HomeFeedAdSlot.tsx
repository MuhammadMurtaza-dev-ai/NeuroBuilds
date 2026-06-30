import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../../Firebase'
import { useAdvertisements } from '../../hooks/useAdvertisements'
import { telemetry } from '../../utils/telemetryTracker'

interface Props {
  accent?: 'cyan' | 'purple'  // kept for API compat; each feed type uses its own colour
}

type FeedKind = 'spon' | 'community' | 'gnews'

interface FeedItem {
  kind: FeedKind
  label: string
  text: string
  href?: string
  threadId?: string
  imageUrl?: string
}

function useTopThreads(count = 5): FeedItem[] {
  const [items, setItems] = useState<FeedItem[]>([])
  useEffect(() => {
    let cancelled = false
    // Fetch extra to account for hidden threads filtered client-side (no composite index needed)
    const q = query(
      collection(db, 'threads'),
      orderBy('upvoteCount', 'desc'),
      limit(count + 5),
    )
    getDocs(q).then(snap => {
      if (cancelled) return
      const visible = snap.docs
        .filter(d => d.data().status !== 'hidden')
        .slice(0, count)
      setItems(
        visible.map(d => ({
          kind: 'community',
          label: '[COMMUNITY]',
          text: (d.data().title as string) ?? 'Discussion',
          threadId: d.id,
        })),
      )
    }).catch(() => { /* degrade silently */ })
    return () => { cancelled = true }
  }, [count])
  return items
}

function useGNewsItems(count = 4): FeedItem[] {
  const [items, setItems] = useState<FeedItem[]>([])
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GNEWS_API_KEY as string | undefined
    if (!apiKey) return

    const CACHE_KEY = 'gnews_cache_us'
    const CACHE_TTL = 24 * 60 * 60 * 1000
    const RATE_LIMIT_TTL = 60 * 60 * 1000

    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached) as {
          articles: { title: string; url: string }[]
          timestamp: number
          rateLimited?: boolean
        }
        const ttl = parsed.rateLimited ? RATE_LIMIT_TTL : CACHE_TTL
        if (Date.now() - parsed.timestamp < ttl) {
          telemetry.recordCacheEvent({ cacheType: 'gnews', key: CACHE_KEY, hit: true, timestamp: Date.now() })
          if (!parsed.rateLimited) {
            setItems(
              parsed.articles.slice(0, count).map(a => ({
                kind: 'gnews',
                label: '[GNEWS]',
                text: a.title,
                href: a.url,
              })),
            )
          }
          return
        }
      }
    } catch { /* stale/corrupt — fall through */ }

    telemetry.recordCacheEvent({ cacheType: 'gnews', key: CACHE_KEY, hit: false, timestamp: Date.now() })
    let cancelled = false

    fetch(
      `https://gnews.io/api/v4/top-headlines?category=technology&lang=en&max=6&token=${apiKey}`
    )
      .then(r => {
        if (r.status === 429) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ articles: [], timestamp: Date.now(), rateLimited: true })) } catch { /* full */ }
          return null
        }
        if (!r.ok) return null
        return r.json()
      })
      .then((data: { articles?: { title: string; url: string }[] } | null) => {
        if (cancelled || !data) return
        const articles = data.articles ?? []
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ articles, timestamp: Date.now() })) } catch { /* full */ }
        setItems(
          articles.slice(0, count).map(a => ({
            kind: 'gnews',
            label: '[GNEWS]',
            text: a.title,
            href: a.url,
          })),
        )
      })
      .catch(() => { /* degrade silently */ })

    return () => { cancelled = true }
  }, [count])
  return items
}

const LABEL_COLOURS: Record<FeedKind, string> = {
  spon:      'text-primary/45',
  community: 'text-accent-purple/55',
  gnews:     'text-blue-400/55',
}

export default function HomeFeedAdSlot({ accent: _accent = 'cyan' }: Props) {
  const navigate = useNavigate()
  const { ads, loading: adsLoading } = useAdvertisements('homepage_feed')
  const communityItems = useTopThreads(5)
  const gnewsItems = useGNewsItems(4)

  const [current, setCurrent] = useState(0)
  const [visible, setVisible] = useState(true)
  const feedRef = useRef<FeedItem[]>([])

  // Build merged feed: sponsor → community → gnews, interleaved
  const sponsorItems: FeedItem[] = ads.map(ad => ({
    kind: 'spon',
    label: '[SPON]',
    text: `${ad.sponsorName} // ${ad.title}`,
    href: ad.targetUrl,
    imageUrl: ad.imageUrl,
  }))

  const feed: FeedItem[] = []
  const maxLen = Math.max(sponsorItems.length, communityItems.length, gnewsItems.length)
  for (let i = 0; i < maxLen; i++) {
    if (communityItems[i]) feed.push(communityItems[i])
    if (gnewsItems[i])     feed.push(gnewsItems[i])
    if (sponsorItems[i])   feed.push(sponsorItems[i])
  }

  feedRef.current = feed

  useEffect(() => {
    if (feed.length <= 1) return
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrent(i => (i + 1) % feedRef.current.length)
        setVisible(true)
      }, 280)
    }, 4200)
    return () => clearInterval(id)
  }, [feed.length])

  if (adsLoading && communityItems.length === 0 && gnewsItems.length === 0) {
    return (
      <div className="mt-2 h-8 rounded border border-dashed border-accent-purple/40 bg-bg-panel/50 animate-pulse" />
    )
  }

  if (feed.length === 0) return null

  const item = feed[current]
  if (!item) return null

  const labelCls = `${LABEL_COLOURS[item.kind]} shrink-0 select-none`

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (item.kind === 'community' && item.threadId) {
      navigate('/community', { state: { openThreadId: item.threadId } })
    } else if (item.href) {
      window.open(item.href, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="mt-2 h-4 overflow-hidden">
      <div
        className={`flex items-center gap-1.5 font-mono text-[11px] transition-all duration-300 ${
          visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
        }`}
      >
        <span className={labelCls}>{item.label}</span>
        {item.imageUrl && item.kind === 'spon' && (
          <img
            src={item.imageUrl}
            alt=""
            className="w-4 h-4 rounded object-cover shrink-0 opacity-60"
          />
        )}
        <button
          onClick={handleClick}
          className="text-gray-600 hover:text-gray-400 truncate transition-colors duration-200 text-left"
          title={item.text}
        >
          {item.text}
        </button>
      </div>
    </div>
  )
}
