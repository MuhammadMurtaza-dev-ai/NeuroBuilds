import { useState, useEffect } from 'react'
import { useAdvertisements } from '../../hooks/useAdvertisements'

interface Props {
  accent?: 'cyan' | 'purple'
}

export default function HomeFeedAdSlot({ accent = 'cyan' }: Props) {
  const { ads, loading } = useAdvertisements('homepage_feed')
  const [current, setCurrent] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (ads.length <= 1) return
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrent(i => (i + 1) % ads.length)
        setVisible(true)
      }, 280)
    }, 4200)
    return () => clearInterval(id)
  }, [ads.length])

  if (loading) {
    return (
      <div className="mt-2 h-8 rounded border border-dashed border-accent-purple/40 bg-bg-panel/50 animate-pulse" />
    )
  }

  if (ads.length === 0) return null

  const ad = ads[current]
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
        {ad.imageUrl && (
          <img
            src={ad.imageUrl}
            alt={ad.sponsorName}
            className="w-4 h-4 rounded object-cover shrink-0 opacity-60"
          />
        )}
        <a
          href={ad.targetUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={e => e.stopPropagation()}
          className="text-gray-600 hover:text-gray-400 truncate transition-colors duration-200"
          title={`${ad.sponsorName} — ${ad.title}`}
        >
          {ad.sponsorName} // {ad.title}
        </a>
      </div>
    </div>
  )
}
