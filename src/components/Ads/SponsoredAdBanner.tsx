import { useState, useEffect, useCallback } from 'react'
import { BANNER_ADS } from '../../data/sponsoredAds'
import type { SponsoredAd } from '../../data/sponsoredAds'
import { useAdvertisements } from '../../hooks/useAdvertisements'

interface Props {
  ads?: SponsoredAd[]
  /** When provided, fetches live ads from Firestore for this placement; falls back to `ads` prop if none found */
  placement?: string
  intervalMs?: number
  /** Tailwind col-span + sizing classes applied to the wrapper div */
  className?: string
}

export default function SponsoredAdBanner({
  ads = BANNER_ADS,
  placement,
  intervalMs = 5500,
  className = 'col-span-1 md:col-span-12',
}: Props) {
  const { ads: firestoreAds } = useAdvertisements(placement ?? '__none__')

  const resolvedAds: SponsoredAd[] =
    placement && firestoreAds.length > 0
      ? firestoreAds.map(a => ({
          id: a.id,
          imageUrl: a.imageUrl ?? '',
          targetUrl: a.targetUrl,
          altText: a.sponsorName,
          sponsorName: a.sponsorName,
          tagline: a.tagline || a.title,
          accent: a.accent,
        }))
      : ads

  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)

  const advance = useCallback(() => {
    setFading(true)
    setTimeout(() => {
      setCurrent(i => (i + 1) % resolvedAds.length)
      setFading(false)
    }, 350)
  }, [resolvedAds.length])

  useEffect(() => {
    if (resolvedAds.length <= 1) return
    const id = setInterval(advance, intervalMs)
    return () => clearInterval(id)
  }, [advance, resolvedAds.length, intervalMs])

  const ad = resolvedAds[current]
  if (!ad) return null

  const isPurple = ad.accent === 'purple'
  const borderCls = isPurple ? 'border-accent-purple/25' : 'border-primary/20'
  const shadowCls = isPurple ? 'shadow-glow-purple' : 'shadow-neon'
  const textCls   = isPurple ? 'text-accent-purple' : 'text-primary'
  const bgCls     = isPurple ? 'bg-accent-purple/10' : 'bg-primary/10'
  const dotCls    = isPurple ? 'bg-accent-purple' : 'bg-primary'
  const pulseCls  = isPurple ? 'bg-accent-purple/60' : 'bg-primary/60'

  return (
    <div
      className={`${className} glass-panel rounded-bento border ${borderCls} ${shadowCls} relative overflow-hidden flex flex-col`}
    >
      <div className="absolute inset-0 scanline pointer-events-none opacity-10" />

      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-sm">
        <span className={`w-1.5 h-1.5 rounded-full ${pulseCls} animate-pulse`} />
        <span className="text-[10px] font-mono text-gray-500 tracking-[0.2em] uppercase select-none">
          Sponsored Node
        </span>
      </div>

      <a
        href={ad.targetUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={`flex-1 flex items-center gap-5 md:gap-8 p-5 md:p-6 transition-opacity duration-300 ${
          fading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div
          className={`w-14 h-14 md:w-[4.5rem] md:h-[4.5rem] rounded-xl shrink-0 border ${borderCls} ${bgCls} flex items-center justify-center overflow-hidden`}
        >
          {ad.imageUrl ? (
            <img src={ad.imageUrl} alt={ad.altText} className="w-full h-full object-cover" />
          ) : (
            <span className={`material-symbols-outlined ${textCls} text-3xl opacity-60`}>
              memory
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-[0.18em] mb-0.5 select-none">
            {ad.sponsorName}
          </p>
          <p className="text-white/85 text-sm md:text-base font-medium leading-snug line-clamp-2">
            {ad.tagline}
          </p>
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-mono ${textCls} opacity-60 mt-1.5`}
          >
            LEARN MORE
            <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
          </span>
        </div>

        {resolvedAds.length > 1 && (
          <div className="hidden md:flex items-center gap-1.5 shrink-0 pr-10">
            {resolvedAds.map((_, i) => (
              <span
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === current ? `w-5 h-1.5 ${dotCls}` : 'w-1.5 h-1.5 bg-white/15'
                }`}
              />
            ))}
          </div>
        )}
      </a>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/5">
        <div
          className={`h-full ${dotCls} opacity-35`}
          style={{ width: `${((current + 1) / resolvedAds.length) * 100}%`, transition: 'none' }}
        />
      </div>
    </div>
  )
}
