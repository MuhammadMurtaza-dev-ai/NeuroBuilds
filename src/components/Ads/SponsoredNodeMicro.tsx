import { useState, useEffect } from 'react'
import { MICRO_ADS } from '../../data/sponsoredAds'
import type { SponsoredAd } from '../../data/sponsoredAds'
import { useAdvertisements } from '../../hooks/useAdvertisements'

interface Props {
  ads?: SponsoredAd[]
  /** When provided, fetches live ads from Firestore for this placement; falls back to `ads` prop if none found */
  placement?: string
  intervalMs?: number
  accent?: 'cyan' | 'purple'
}

export default function SponsoredNodeMicro({
  ads = MICRO_ADS,
  placement,
  intervalMs = 4200,
  accent = 'cyan',
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
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (resolvedAds.length <= 1) return
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrent(i => (i + 1) % resolvedAds.length)
        setVisible(true)
      }, 280)
    }, intervalMs)
    return () => clearInterval(id)
  }, [resolvedAds.length, intervalMs])

  const ad = resolvedAds[current]
  if (!ad) return null

  const tagCls = accent === 'purple' ? 'text-accent-purple/45' : 'text-primary/45'

  return (
    <div className="mt-2 h-4 overflow-hidden">
      <div
        className={`flex items-center gap-1.5 font-mono text-[11px] transition-all duration-300 ${
          visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
        }`}
      >
        <span className={`${tagCls} shrink-0 select-none`}>[SPON]</span>
        <a
          href={ad.targetUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={e => e.stopPropagation()}
          className="text-gray-600 hover:text-gray-400 truncate transition-colors duration-200"
          title={`${ad.sponsorName} — ${ad.tagline}`}
        >
          {ad.sponsorName} // {ad.tagline}
        </a>
      </div>
    </div>
  )
}
