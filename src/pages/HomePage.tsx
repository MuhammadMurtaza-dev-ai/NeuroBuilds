import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../Firebase'
import { timeAgo } from '../hooks/useCommunity'
import type { Listing } from '../hooks/useStorage'
import GradientBackground from '../components/GradientBackground/GradientBackground'
import BannerCarousel from '../components/Ads/BannerCarousel'
import HomeFeedAdSlot from '../components/Ads/HomeFeedAdSlot'
import ListingCard from '../components/Marketplace/ListingCard'

interface FeaturedPost {
  id: string
  title: string
  authorName: string
  thumbnailUrl: string
}

interface FeedThread {
  id: string
  title: string
  category: string
  createdAt: string
}

const FEED_CATEGORY_LABEL: Record<string, string> = {
  hardware: 'HW',
  loops: 'LOOP',
  software: 'SW',
  builds: 'BUILD',
  marketplace: 'MKT',
}

const FEED_CATEGORY_COLOR: Record<string, string> = {
  hardware: 'text-accent-purple',
  loops: 'text-blue-400',
  software: 'text-green-400',
  builds: 'text-orange-400',
  marketplace: 'text-pink-400',
}

export default function HomePage() {
  const [inputValue, setInputValue] = useState('')
  const [featuredPost, setFeaturedPost] = useState<FeaturedPost | null>(null)
  const [featuredLoading, setFeaturedLoading] = useState(true)
  const [feedThreads, setFeedThreads] = useState<FeedThread[]>([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [latestListings, setLatestListings] = useState<Listing[]>([])
  const [listingsLoading, setListingsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        // Uses existing composite index: isPublished + createdAt (desc)
        const q = query(
          collection(db, 'blogs'),
          where('isPublished', '==', true),
          orderBy('createdAt', 'desc'),
          limit(10)
        )
        const snap = await getDocs(q)
        const hardwareDoc = snap.docs.find(d => d.data().category === 'Hardware')
        if (hardwareDoc) {
          const data = hardwareDoc.data()
          setFeaturedPost({
            id: hardwareDoc.id,
            title: data.title ?? '',
            authorName: data.authorName ?? '',
            thumbnailUrl: data.thumbnailUrl ?? '',
          })
        }
      } catch {
        // Silently degrade — no featured post shown
      } finally {
        setFeaturedLoading(false)
      }
    }
    fetchFeatured()
  }, [])

  useEffect(() => {
    const q = query(
      collection(db, 'threads'),
      orderBy('createdAt', 'desc'),
      limit(5)
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: FeedThread[] = snap.docs
          .filter(d => (d.data().status ?? 'active') !== 'hidden')
          .slice(0, 3)
          .map(d => {
            const data = d.data()
            return {
              id: d.id,
              title: data.title ?? '',
              category: data.category ?? '',
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt.toDate().toISOString()
                  : String(data.createdAt ?? ''),
            }
          })
        setFeedThreads(items)
        setFeedLoading(false)
      },
      () => setFeedLoading(false)
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    const fetchLatestListings = async () => {
      try {
        // Order by postedDate only (automatic single-field index — no composite
        // index required) and filter `status === 'active'` client-side. This
        // avoids depending on the `status + postedDate` composite index being
        // deployed, which silently breaks this carousel when it's missing.
        const q = query(
          collection(db, 'listings'),
          orderBy('postedDate', 'desc'),
          limit(20)
        )
        const snap = await getDocs(q)
        const items: Listing[] = snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            title: data.title ?? '',
            description: data.description ?? '',
            price: data.price ?? 0,
            negotiable: data.negotiable ?? false,
            category: data.category ?? '',
            condition: (data.condition ?? 'used') as Listing['condition'],
            listingType: (data.listingType ?? 'sell') as Listing['listingType'],
            images: data.images ?? [],
            country: data.country ?? '',
            province: data.province,
            location: data.location ?? '',
            sellerId: data.sellerId ?? '',
            sellerName: data.sellerName ?? '',
            sellerContact: data.sellerContact ?? '',
            postedDate:
              data.postedDate instanceof Timestamp
                ? data.postedDate.toDate().toISOString()
                : String(data.postedDate ?? ''),
            savedBy: data.savedBy ?? [],
            status: (data.status ?? 'active') as Listing['status'],
            tags: data.tags ?? [],
            specs: data.specs ?? {},
            stockQuantity: data.stockQuantity,
            sku: data.sku,
          }
        })
        setLatestListings(items.filter(l => l.status === 'active').slice(0, 4))
      } catch (err) {
        // Degrade gracefully — carousel stays empty — but surface the cause.
        console.error('HomePage: failed to load latest listings', err)
      } finally {
        setListingsLoading(false)
      }
    }
    fetchLatestListings()
  }, [])

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      navigate('/chat', { state: { initialMessage: inputValue } })
    }
  }

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1440px] mx-auto w-full">
        {/* Hero Grid Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-20">
          {/* Build Intelligence — Sponsored Ad Carousel (replaces static hero card) */}
          <BannerCarousel className="col-span-1 md:col-span-8" />

          {/* Live Stats — merged panel: both counters share one container */}
          <div className="col-span-1 md:col-span-4 flex flex-col">
            <div className="glass-panel rounded-bento p-6 flex-1 flex flex-col justify-center">
              <span className="inline-flex items-center gap-2 self-start text-[10px] font-mono text-primary px-3 py-1 rounded-full border border-primary/30 bg-primary/5 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block"></span>
                WELCOME TO NEUROBUILDS
              </span>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tighter text-white leading-tight">
                Build smarter PCs with an{' '}
                <span className="bg-gradient-to-r from-primary to-accent-purple bg-clip-text text-transparent">
                  AI co-pilot
                </span>.
              </h1>
            </div>
          </div>

          {/* AI Chat Input */}
          <div className="col-span-1 md:col-span-12 relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-accent-purple to-primary rounded-bento opacity-30 group-hover:opacity-100 blur transition duration-500"></div>
            <div className="relative bg-bg-panel rounded-bento p-1 flex items-center overflow-hidden">
              <div className="w-full bg-bg-dark rounded-[1.8rem] h-20 md:h-24 flex items-center px-6 md:px-10 gap-4 scanline shadow-inner">
                <span className="text-primary font-mono text-xl md:text-2xl font-bold select-none">&gt;_</span>
                <input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  className="bg-transparent border-none outline-none text-white text-lg md:text-2xl font-mono w-full placeholder-gray-600 focus:ring-0 h-full"
                  placeholder="Ask Neuro about compatibility, benchmarks, or pricing..."
                  type="text"
                />
                <div className="hidden md:flex items-center gap-2 text-xs font-mono text-gray-500 border border-gray-300 dark:border-gray-800 rounded px-2 py-1 bg-black/10 dark:bg-black/40">
                  <span>RETURN</span>
                  <span className="material-symbols-outlined text-[14px]">keyboard_return</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live News Feed — below the AI chat bar */}
          <div className="col-span-1 md:col-span-12 glass-panel rounded-bento px-6 py-4 flex items-center gap-4 border border-border-glass">
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-mono font-bold tracking-[0.15em] text-primary/80">
                LIVE_FEED
              </span>
            </div>
            <div className="w-px h-4 bg-border-glass shrink-0" />
            <div className="flex-1 min-w-0">
              <HomeFeedAdSlot accent="cyan" />
            </div>
            <span className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-primary/50 px-2 py-1 rounded-full border border-primary/20 bg-primary/5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
              LIVE
            </span>
          </div>

          {/* Featured Build — dynamic from Firestore blogs (Hardware + published) */}
          {featuredLoading ? (
          <div className="col-span-1 md:col-span-5 h-40 sm:h-56 lg:h-80 rounded-bento overflow-hidden border border-black/10 dark:border-white/10 bg-bg-panel animate-pulse relative">
              <div className="absolute bottom-0 left-0 p-8 w-full space-y-3">
                <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-28" />
                <div className="h-6 bg-black/10 dark:bg-white/10 rounded w-3/4" />
                <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/3" />
                <div className="h-8 bg-black/10 dark:bg-white/10 rounded w-40 mt-2" />
              </div>
            </div>
          ) : featuredPost ? (
            <div className="col-span-1 md:col-span-5 h-40 sm:h-56 lg:h-80 relative rounded-bento overflow-hidden group border border-black/10 dark:border-white/10">
              {featuredPost.thumbnailUrl ? (
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                  style={{ backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.1)), url("${featuredPost.thumbnailUrl}")` }}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#252526] to-[#1e1e1e]" />
              )}
              <div className="absolute bottom-0 left-0 p-5 sm:p-8 w-full z-10">
                <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold text-white mb-2 inline-block border border-white/10">
                  FEATURED BUILD
                </span>
                <h3 className="text-2xl font-bold text-white line-clamp-2 mb-1">{featuredPost.title}</h3>
                <p className="text-gray-300 text-sm mb-3">by {featuredPost.authorName}</p>
                <button
                  onClick={() => navigate('/blog', { state: { openPostId: featuredPost.id } })}
                  className="min-h-11 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/20 hover:bg-primary/40 border border-primary/30 text-primary text-xs font-bold transition-all"
                >
                  VIEW BUILD DETAILS
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="col-span-1 md:col-span-5 h-40 sm:h-56 lg:h-80 relative rounded-bento overflow-hidden border border-black/10 dark:border-white/10">
              <div className="absolute inset-0 bg-gradient-to-br from-bg-panel to-bg-dark" />
              <div className="absolute bottom-0 left-0 p-5 sm:p-8 w-full">
                <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold text-white mb-2 inline-block border border-white/10">
                  FEATURED BUILD
                </span>
                <p className="text-gray-600 text-sm font-mono mt-1">No featured builds yet.</p>
                <button
                  onClick={() => navigate('/blog')}
                  className="mt-3 min-h-11 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 text-xs font-bold transition-all"
                >
                  BROWSE BLOG
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </button>
              </div>
            </div>
          )}

          {/* Intelligence Feed */}
          <div className="col-span-1 md:col-span-7 glass-panel rounded-bento p-8 flex flex-col relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                INTELLIGENCE FEED
              </h3>
              <span className="flex items-center gap-1.5 text-xs font-mono text-primary/70 px-2 py-1 rounded-full border border-primary/20 bg-primary/5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block"></span>
                LIVE
              </span>
            </div>
            <div className="flex flex-col gap-3 font-mono text-sm overflow-y-auto max-h-[200px] pr-2">
              {feedLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-4 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 items-center animate-pulse">
                    <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-14 shrink-0" />
                    <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-10 shrink-0" />
                    <div className="h-3 bg-black/10 dark:bg-white/10 rounded flex-1" />
                  </div>
                ))
              ) : feedThreads.length > 0 ? (
                feedThreads.map(thread => (
                  <div
                    key={thread.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/community', { state: { openThreadId: thread.id } })}
                    onKeyDown={(e) => e.key === 'Enter' && navigate('/community', { state: { openThreadId: thread.id } })}
                    className="flex gap-4 p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/8 dark:hover:bg-white/10 transition-colors border border-black/5 dark:border-white/5 items-center group cursor-pointer"
                  >
                    <span className="text-gray-500 shrink-0">{timeAgo(thread.createdAt)}</span>
                    <span className={`font-bold shrink-0 ${FEED_CATEGORY_COLOR[thread.category] ?? 'text-primary'}`}>
                      {FEED_CATEGORY_LABEL[thread.category] ?? thread.category.toUpperCase().slice(0, 4)}
                    </span>
                    <span className="text-gray-300 truncate">{thread.title}</span>
                    <span className="material-symbols-outlined text-gray-600 group-hover:text-primary ml-auto text-sm">arrow_forward</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-600 text-xs text-center py-6">No community posts yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Marketplace Section */}
        <section className="mb-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8 px-1 sm:px-4">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              MARKETPLACE <span className="block sm:inline text-gray-600 text-lg font-normal sm:ml-2">// LATEST DROPS</span>
            </h2>
            <button
              onClick={() => navigate('/marketplace')}
              className="min-h-11 text-xs text-primary font-mono border border-primary/30 hover:border-primary/70 hover:bg-primary/10 rounded-full px-4 py-2 transition-all self-start sm:self-auto"
            >
              VIEW ALL &rarr;
            </button>
          </div>

          <div className="rounded-[2rem] sm:rounded-[4rem] bg-bg-panel border border-border-glass p-3 sm:p-4 md:p-6 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none"></div>
            {listingsLoading ? (
              <div className="flex gap-4 pb-4 px-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="min-w-[280px] md:min-w-[320px] shrink-0 snap-center bg-bg-panel rounded-[2rem] p-4 border border-border-glass animate-pulse flex flex-col gap-4"
                  >
                    <div className="aspect-[4/3] rounded-[1.5rem] bg-black/5 dark:bg-white/5" />
                    <div className="space-y-2 px-2 pb-2">
                      <div className="h-5 bg-black/5 dark:bg-white/5 rounded w-3/4" />
                      <div className="h-3 bg-black/5 dark:bg-white/5 rounded w-1/2" />
                      <div className="h-10 bg-black/5 dark:bg-white/5 rounded-xl mt-4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : latestListings.length > 0 ? (
              <div className="flex overflow-x-auto gap-4 pb-4 px-2 no-scrollbar scroll-smooth snap-x">
                {latestListings.map(listing => (
                  <div key={listing.id} className="min-w-[280px] md:min-w-[320px] shrink-0 snap-center">
                    <ListingCard
                      listing={listing}
                      savedByCurrentUser={false}
                      onClick={() => navigate(`/marketplace?id=${listing.id}`)}
                      onSave={(e) => { e.stopPropagation(); navigate(`/marketplace?id=${listing.id}`); }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600 text-sm font-mono text-center py-12">No active listings yet.</p>
            )}
          </div>
        </section>
      </main>
    </>
  )
}
