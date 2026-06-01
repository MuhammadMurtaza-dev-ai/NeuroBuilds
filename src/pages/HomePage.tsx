import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getCountFromServer } from 'firebase/firestore'
import { db } from '../Firebase'
import GradientBackground from '../components/GradientBackground/GradientBackground'

export default function HomePage() {
  const [inputValue, setInputValue] = useState('')
  const [activeListingsCount, setActiveListingsCount] = useState<number | null>(null)
  const [threadCount, setThreadCount] = useState<number | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [listingsSnap, threadsSnap] = await Promise.all([
          getCountFromServer(query(collection(db, 'listings'), where('status', '==', 'active'))),
          getCountFromServer(collection(db, 'threads')),
        ])
        setActiveListingsCount(listingsSnap.data().count)
        setThreadCount(threadsSnap.data().count)
      } catch {
        // Silently degrade — counters remain null (show '--')
      }
    }
    fetchStats()
  }, [])

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      navigate('/chat', { state: { initialMessage: inputValue } })
    }
  }

  const formatCount = (n: number | null) =>
    n === null ? '--' : n.toLocaleString()

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1440px] mx-auto w-full">
        {/* Hero Grid Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-20">
          {/* Main Hero Card */}
          <div className="col-span-1 md:col-span-8 glass-panel rounded-bento p-8 md:p-10 flex flex-col justify-between min-h-[300px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
              <span className="material-symbols-outlined text-8xl text-white">memory</span>
            </div>
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-purple/20 border border-accent-purple/30 text-accent-purple text-xs font-bold mb-4">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-purple opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-purple"></span>
                </span>
                IDE v2.4 LIVE
              </div>
              <h1 className="text-4xl md:text-6xl font-bold leading-tight tracking-tight max-w-lg mb-4">
                BUILD INTELLIGENCE <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent-purple">PLATFORM</span>
              </h1>
              <p className="text-gray-400 max-w-md text-lg">
                Analyze hardware trends, community stats, and marketplace listings in a unified, developer-grade interface.
              </p>
            </div>
            <div className="flex gap-4 mt-8 relative z-10">
              <div className="flex items-center gap-2 text-sm text-gray-500 font-mono">
                <span className="text-primary">●</span> RTX 4090 Stock: Low
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 font-mono">
                <span className="text-green-500">●</span> Server: Online
              </div>
            </div>
          </div>

          {/* Live Stats Cards */}
          <div className="col-span-1 md:col-span-4 flex flex-col gap-6">
            <div className="glass-panel rounded-bento p-6 flex-1 flex flex-col justify-center border-l-4 border-l-primary hover:bg-white/5 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-400 text-sm font-medium uppercase tracking-wider">Active Listings</p>
                <span className="material-symbols-outlined text-primary">developer_board</span>
              </div>
              <p className="text-4xl font-bold text-white tracking-tighter">
                {formatCount(activeListingsCount)}
              </p>
              <p className="text-primary text-sm font-mono mt-1">&gt; Live from Firestore</p>
            </div>
            <div className="glass-panel rounded-bento p-6 flex-1 flex flex-col justify-center border-l-4 border-l-accent-purple hover:bg-white/5 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-400 text-sm font-medium uppercase tracking-wider">Forum Posts</p>
                <span className="material-symbols-outlined text-accent-purple">forum</span>
              </div>
              <p className="text-4xl font-bold text-white tracking-tighter">
                {formatCount(threadCount)}
              </p>
              <p className="text-accent-purple text-sm font-mono mt-1">&gt; Live from Firestore</p>
            </div>
          </div>

          {/* AI Chat Input */}
          <div className="col-span-1 md:col-span-12 relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-accent-purple to-primary rounded-bento opacity-30 group-hover:opacity-100 blur transition duration-500"></div>
            <div className="relative bg-[#111] rounded-bento p-1 flex items-center overflow-hidden">
              <div className="w-full bg-[#1e1e1e] rounded-[1.8rem] h-20 md:h-24 flex items-center px-6 md:px-10 gap-4 scanline shadow-inner">
                <span className="text-primary font-mono text-xl md:text-2xl font-bold select-none">&gt;_</span>
                <input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  className="bg-transparent border-none outline-none text-white text-lg md:text-2xl font-mono w-full placeholder-gray-600 focus:ring-0 h-full"
                  placeholder="Ask Neuro about compatibility, benchmarks, or pricing..."
                  type="text"
                />
                <div className="hidden md:flex items-center gap-2 text-xs font-mono text-gray-600 border border-gray-800 rounded px-2 py-1 bg-black/40">
                  <span>RETURN</span>
                  <span className="material-symbols-outlined text-[14px]">keyboard_return</span>
                </div>
              </div>
            </div>
          </div>

          {/* Featured Build Image */}
          <div className="col-span-1 md:col-span-5 h-64 md:h-80 relative rounded-bento overflow-hidden group border border-white/10">
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{
                backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0)), url("https://lh3.googleusercontent.com/aida-public/AB6AXuDH2rJHMDjOLbiDqqSgz11fMCG7YrDjJm2IpFV8hMir43IrhXy7POMb1VnpMikqC7g8VzH4-eeftbSZND0SzXK-IE02BWTyuGlZ6GXvnOMTTXn1gsaeICcc25_DwPBdwv34FvjLS_NixDBbvB3cf5_Bn40uTIP1H0EeIRzO8fXbniVx0pOFccJYBeW0tm8YwH84GyHTrrXzVF-rI5LALC3rdFxbBipcNWwra6UPtUN-DyTxLBXg6TpPeUnTdW4yrqPUJA7hPytRdNM")'
              }}
            ></div>
            <div className="absolute bottom-0 left-0 p-8 w-full">
              <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold text-white mb-2 inline-block border border-white/10">
                FEATURED BUILD
              </span>
              <h3 className="text-2xl font-bold text-white">Project: NEON_GENESIS</h3>
              <p className="text-gray-300 text-sm mt-1">by @cyber_architect</p>
            </div>
          </div>

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
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate('/community')}
                onKeyDown={(e) => e.key === 'Enter' && navigate('/community')}
                className="flex gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 items-center group cursor-pointer"
              >
                <span className="text-gray-500 shrink-0">10:42 AM</span>
                <span className="text-primary font-bold shrink-0">GPU</span>
                <span className="text-gray-300 truncate">NVIDIA RTX 5090 leaked specifications analysis...</span>
                <span className="material-symbols-outlined text-gray-600 group-hover:text-primary ml-auto text-sm">arrow_forward</span>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate('/community')}
                onKeyDown={(e) => e.key === 'Enter' && navigate('/community')}
                className="flex gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 items-center group cursor-pointer"
              >
                <span className="text-gray-500 shrink-0">09:15 AM</span>
                <span className="text-accent-purple font-bold shrink-0">CPU</span>
                <span className="text-gray-300 truncate">Intel Core Ultra 9 benchmarks surfaced on Geekbench...</span>
                <span className="material-symbols-outlined text-gray-600 group-hover:text-primary ml-auto text-sm">arrow_forward</span>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate('/community')}
                onKeyDown={(e) => e.key === 'Enter' && navigate('/community')}
                className="flex gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 items-center group cursor-pointer"
              >
                <span className="text-gray-500 shrink-0">08:00 AM</span>
                <span className="text-blue-400 font-bold shrink-0">MKT</span>
                <span className="text-gray-300 truncate">DDR5 RAM prices drop by 15% globally...</span>
                <span className="material-symbols-outlined text-gray-600 group-hover:text-primary ml-auto text-sm">arrow_forward</span>
              </div>
            </div>
          </div>
        </div>

        {/* Marketplace Section */}
        <section className="mb-20">
          <div className="flex items-center justify-between mb-8 px-4">
            <h2 className="text-3xl font-bold tracking-tight">
              MARKETPLACE <span className="text-gray-600 text-lg font-normal ml-2">// LATEST DROPS</span>
            </h2>
            <button
              onClick={() => navigate('/marketplace')}
              className="text-xs text-primary font-mono border border-primary/30 hover:border-primary/70 hover:bg-primary/10 rounded-full px-4 py-2 transition-all"
            >
              VIEW ALL &rarr;
            </button>
          </div>

          <div className="rounded-[4rem] bg-[#1a1a1a] border border-white/5 p-4 md:p-6 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none"></div>
            <div className="flex overflow-x-auto gap-4 pb-4 px-2 no-scrollbar scroll-smooth snap-x">
              {[
                {
                  title: 'GeForce RTX 4080',
                  desc: 'Founders Edition • 16GB GDDR6X',
                  price: '$1,199',
                  badge: 'IN STOCK',
                  badgeColor: 'bg-black/60',
                  hoverColor: 'hover:border-primary/50',
                  image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDbD2NXhjg7g39BjWrURYOm72gK6rz3SQ8KX5gWyMeBZYy-KndUDpq8yPmiss0j3w7pu8Ymebums1btyvFXe3aoKOEpRxaxOfphTafKMOfnLLIoHNvpNnzgG37P6TKWPuvCeJ7EagzJOI7jCfsXytmGMuzXUJJ1K1CaWsUxtJjnA-FHAGuqmuJhs2KDsEWhhxDKUr0vs-xVfiiPfDVeT5BD9GBDUaA0ZyOeg3Q7kp_zn28wQ7AVTPx4L6in_JS_v_fS9Pf_Rn0JQo8',
                },
                {
                  title: 'Ryzen 9 7950X',
                  desc: '16 Cores • 32 Threads • 5.7GHz',
                  price: '$599',
                  badge: 'HOT',
                  badgeColor: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
                  hoverColor: 'hover:border-accent-purple/50',
                  image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBxoWJ7Lho3BypQnh1kVTrbKGl640c1h_8Ox06UlTIUWyY4Wtg-4V39_H749ar0FN81ssF4j3kvtyeAjtSMb6WLya8fKU0Zc0_2NNX2dJDVs3N1O7l6eqx8T-gypV_hmQ9QuxryfKRikaGtD2s_S9_3Sg5AuuijKoT6DdvsUTaJZpQ7tLKQ1uTMbWk1N_M2jIx9uxCIm6vvTydCS8xg-VJL0iUj4hccdqIxA1kM7ouUPB9mfLIPvBP9Zth0aym6zcu4pFwfwp4N9Xc',
                },
                {
                  title: 'Trident Z5 RGB',
                  desc: '32GB (2x16GB) • DDR5-6400',
                  price: '$289',
                  badge: undefined,
                  badgeColor: '',
                  hoverColor: 'hover:border-primary/50',
                  image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC2-a8rFMiZQfDJQwiizPspbROWahf2U4wTkJeRosm7JMFcd-71qCiL0vZgk9Odt334ZILJQpyqNz01LkfvcZ8Q4Q0Zgv5lSoiAMU9jPYfecfPdpM8PAEGTBS0p6Apmvx7O8yBMZUZjGIi41DDoWMjIlugaduqXaO6WlzR-ddQOUmYE6QpkvL8nvWk9-3FZw_ZnfYN6ygBncBhD5SZkptLDkAFCRlIhjYEqmDoOJvtxpe0XIXiehQGpN0Cne5168rOaTaJ2CCObs4A',
                },
                {
                  title: 'Kraken Elite 360',
                  desc: 'RGB AIO • LCD Display • White',
                  price: '$279',
                  badge: undefined,
                  badgeColor: '',
                  hoverColor: 'hover:border-primary/50',
                  image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuABz41AvLnb-d-IQXdinIf5ON8MQtBlg8w6quGXapkbJ5TlJc1aaD5KnXc7uWw4sWFswuCb0vUi-JXx1uXz-dBnGgrxbEL681Eq_d98O5fGLUED8Rq2pnRCV9M4KV1N8kxL1nTcN-drrcZLOqFytbdADS_XWzw4B8wXBhlcgJMyV5-i8xpe_jp26CLaRkQ8Adg9nSV38uFRez_4vreGiRie36fUnOGYQsmq7uu2E5euidB9sjenu0f0gNs5As8f2QT0CmqhgpAxX9Y',
                },
              ].map((product, idx) => (
                <div
                  key={idx}
                  className={`min-w-[280px] md:min-w-[320px] snap-center bg-bg-panel rounded-[2rem] p-4 border border-white/5 ${product.hoverColor} transition-all group flex flex-col gap-4`}
                >
                  <div className="aspect-[4/3] rounded-[1.5rem] bg-black/50 overflow-hidden relative">
                    <div
                      className="absolute inset-0 bg-cover bg-center group-hover:scale-110 transition-transform duration-500"
                      style={{ backgroundImage: `url("${product.image}")` }}
                    ></div>
                    {product.badge && (
                      <div className={`absolute top-3 right-3 ${product.badgeColor} backdrop-blur px-2 py-1 rounded-full text-xs font-bold border`}>
                        {product.badge}
                      </div>
                    )}
                  </div>
                  <div className="px-2 pb-2">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                        {product.title}
                      </h4>
                      <span className="text-white font-mono">{product.price}</span>
                    </div>
                    <p className="text-gray-500 text-sm mb-4 line-clamp-1">{product.desc}</p>
                    <button
                      onClick={() => navigate('/marketplace')}
                      className="w-full py-3 rounded-xl bg-white/5 hover:bg-primary hover:text-bg-dark text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
                    >
                      VIEW IN MARKETPLACE
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/community')}
            className="glass-panel rounded-full px-8 py-6 flex items-center justify-between group cursor-pointer hover:border-accent-purple/30 transition-all w-full max-w-lg text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-accent-purple/20 transition-colors">
                <span className="material-symbols-outlined text-gray-300 group-hover:text-accent-purple">
                  people
                </span>
              </div>
              <div>
                <h4 className="font-bold text-white">Join Community</h4>
                <p className="text-gray-400 text-sm">Connect with builders worldwide</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-gray-400 group-hover:text-accent-purple">
              arrow_forward
            </span>
          </button>
        </div>
      </main>
    </>
  )
}
