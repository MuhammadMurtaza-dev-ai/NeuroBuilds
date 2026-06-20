import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../Firebase'

export interface Advertisement {
  id: string
  title: string
  sponsorName: string
  targetUrl: string
  imageUrl: string
  placement: string
  status: 'active' | 'inactive'
  accent: 'cyan' | 'purple'
  tagline?: string
  /** Promotes the ad into the premium top block of the marketplace grid. */
  featured?: boolean
}

export function useAdvertisements(placement: string) {
  const [ads, setAds] = useState<Advertisement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'advertisements'),
      where('status', '==', 'active'),
      where('placement', '==', placement),
    )

    const unsub = onSnapshot(
      q,
      snap => {
        setAds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Advertisement)))
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
    )

    return unsub
  }, [placement])

  return { ads, loading }
}

export function useAllAdvertisements() {
  const [ads, setAds] = useState<Advertisement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'advertisements'),
      orderBy('placement'),
    )

    const unsub = onSnapshot(
      q,
      snap => {
        setAds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Advertisement)))
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
    )

    return unsub
  }, [])

  return { ads, loading }
}
