import { useState, useEffect, useCallback } from 'react'
import { useAdvertisements } from '../../hooks/useAdvertisements'
import { BANNER_ADS } from '../../data/sponsoredAds'

interface Props {
  className?: string
  intervalMs?: number
}

export default function BannerCarousel({ className = 'col-span-1 md:col-span-8', intervalMs = 5500 }: Props) {
  const { ads: firestoreAds, loading } = useAdvertisements('banner')

  // Use Firestore ads when available; fall back to static BANNER_ADS (filter to those with images)
  const slides = firestoreAds.length > 0
    ? firestoreAds
    : BANNER_ADS.filter(a => a.imageUrl).map(a => ({
        id: a.id,
        imageUrl: a.imageUrl,
        targetUrl: a.targetUrl,
        sponsorName: a.sponsorName,
        tagline: a.tagline,
        accent: a.accent,
      }))

  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)

  const advance = useCallback(() => {
    if (slides.length <= 1) return
    setFading(true)
    setTimeout(() => {
      setCurrent(i => (i + 1) % slides.length)
      setFading(false)
    }, 300)
  }, [slides.length])

  useEffect(() => {
    if (slides.length <= 1) return
    const id = setInterval(advance, intervalMs)
    return () => clearInterval(id)
  }, [advance, slides.length, intervalMs])

  if (loading) {
    return (
      <div className={`${className} rounded-bento bg-white/5 animate-pulse min-h-[260px] md:min-h-[380px]`} />
    )
  }

  if (slides.length === 0) return null

  const activeIndex = current % slides.length
  const slide = slides[activeIndex]

  return (
    <div className={`${className} relative rounded-bento overflow-hidden min-h-[260px] md:min-h-[380px] bg-bg-panel`}>
      {/* Slides */}
      {slides.map((s, i) => (
        <a
          key={s.id}
          href={s.targetUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={`${s.sponsorName} — ${s.tagline ?? ''}`}
          className={`absolute inset-0 transition-opacity duration-300 ${
            i === activeIndex
              ? fading ? 'opacity-0' : 'opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          {s.imageUrl ? (
            <img
              src={s.imageUrl}
              alt={s.sponsorName}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            /* Fallback gradient when no image — keeps carousel cycling */
            <div
              className={`w-full h-full flex flex-col items-center justify-center gap-3 ${
                s.accent === 'purple'
                  ? 'bg-gradient-to-br from-accent-purple/20 to-bg-dark'
                  : 'bg-gradient-to-br from-primary/15 to-bg-dark'
              }`}
            >
              <span className="material-symbols-outlined text-5xl text-white/20">campaign</span>
              <p className="text-white/50 text-sm font-mono">{s.sponsorName}</p>
            </div>
          )}
        </a>
      ))}

      {/* SPONSORED badge */}
      <div className="absolute top-3 right-3 z-10 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-sm">
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${slide.accent === 'purple' ? 'bg-accent-purple/70' : 'bg-primary/70'}`} />
          <span className="text-[10px] font-mono text-gray-500 tracking-[0.2em] uppercase select-none">Sponsored</span>
        </div>
      </div>

      {/* Dot indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 pointer-events-none">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? `w-5 h-1.5 ${slide.accent === 'purple' ? 'bg-accent-purple' : 'bg-primary'}`
                  : 'w-1.5 h-1.5 bg-white/25'
              }`}
            />
          ))}
        </div>
      )}

      {/* Progress bar */}
      {slides.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/5 z-10 pointer-events-none">
          <div
            className={`h-full opacity-40 ${slide.accent === 'purple' ? 'bg-accent-purple' : 'bg-primary'}`}
            style={{ width: `${((activeIndex + 1) / slides.length) * 100}%`, transition: 'none' }}
          />
        </div>
      )}
    </div>
  )
}
