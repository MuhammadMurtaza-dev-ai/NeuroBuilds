export interface SponsoredAd {
  id: string
  imageUrl: string   // leave '' to use the gradient icon fallback
  targetUrl: string
  altText: string
  sponsorName: string
  tagline: string
  accent: 'cyan' | 'purple'
}

export const BANNER_ADS: SponsoredAd[] = [
  {
    id: 'asus-rog-z790',
    imageUrl: '',
    targetUrl: '#',
    altText: 'ASUS ROG Maximus Z790 Hero Motherboard',
    sponsorName: 'ASUS ROG',
    tagline: 'Maximus Z790 Hero — built for extreme overclocking. Own every benchmark.',
    accent: 'cyan',
  },
  {
    id: 'corsair-dominator-ddr5',
    imageUrl: '',
    targetUrl: '#',
    altText: 'Corsair Dominator Platinum RGB DDR5',
    sponsorName: 'Corsair',
    tagline: 'Dominator Platinum RGB DDR5-6200 — maximum performance, extreme aesthetics.',
    accent: 'purple',
  },
  {
    id: 'nzxt-kraken-elite',
    imageUrl: '',
    targetUrl: '#',
    altText: 'NZXT Kraken Elite 360 RGB AIO',
    sponsorName: 'NZXT',
    tagline: 'Kraken Elite 360 AIO — LCD display, zero-compromise thermal control for every rig.',
    accent: 'cyan',
  },
  {
    id: 'evga-supernova-1000',
    imageUrl: '',
    targetUrl: '#',
    altText: 'EVGA SuperNOVA 1000 G7 Power Supply',
    sponsorName: 'EVGA',
    tagline: 'SuperNOVA 1000 G7 — 80+ Gold, fully modular, backed by a 10-year warranty.',
    accent: 'purple',
  },
]

export const MICRO_ADS: SponsoredAd[] = [
  {
    id: 'kingston-fury-beast',
    imageUrl: '',
    targetUrl: '#',
    altText: 'Kingston Fury Beast DDR5',
    sponsorName: 'Kingston',
    tagline: 'Fury Beast DDR5-5600 32GB — PKR 28,500',
    accent: 'cyan',
  },
  {
    id: 'seagate-barracuda-2tb',
    imageUrl: '',
    targetUrl: '#',
    altText: 'Seagate Barracuda 2TB SSD',
    sponsorName: 'Seagate',
    tagline: 'Barracuda 2TB SSD — PKR 12,000 • Limited Stock',
    accent: 'cyan',
  },
  {
    id: 'be-quiet-dark-power',
    imageUrl: '',
    targetUrl: '#',
    altText: 'be quiet! Dark Power Pro 13 1000W',
    sponsorName: 'be quiet!',
    tagline: 'Dark Power Pro 13 1000W 80+ Titanium',
    accent: 'purple',
  },
  {
    id: 'gigabyte-aorus-gen5',
    imageUrl: '',
    targetUrl: '#',
    altText: 'Gigabyte AORUS Gen5 10000 NVMe SSD',
    sponsorName: 'Gigabyte',
    tagline: 'AORUS Gen5 10000 SSD 2TB — PKR 42,000',
    accent: 'purple',
  },
]
