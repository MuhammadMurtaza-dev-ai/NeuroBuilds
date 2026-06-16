import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../Firebase';
import { useMarketplace, DEFAULT_FILTERS } from '../hooks/useMarketplace';
import type { MarketplaceFilters } from '../hooks/useMarketplace';
import { useAuth } from '../hooks/useAuth';
import { GLOBAL_LOCATIONS } from '../data/globalLocations';
import GradientBackground from '../components/GradientBackground/GradientBackground';
import ListingCard from '../components/Marketplace/ListingCard';
import ListingDetailModal from '../components/Marketplace/ListingDetailModal';
import CreateListingModal from '../components/Marketplace/CreateListingModal';
import NewsFallback from '../components/NewsFallback/NewsFallback';
import type { Listing } from '../hooks/useStorage';

const CATEGORIES = [
  { name: 'All', icon: 'grid_view', id: 'all' },
  { name: 'Components', icon: 'memory', id: 'components' },
  { name: 'Laptops', icon: 'laptop_chromebook', id: 'laptops' },
  { name: 'Peripherals', icon: 'keyboard', id: 'peripherals' },
  { name: 'Consoles', icon: 'videogame_asset', id: 'consoles' },
  { name: 'Monitors', icon: 'monitor', id: 'monitors' },
];

const DAY_MS = 86_400_000;

interface Props {
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export default function MarketplacePage({ onOpenAuth }: Props) {
  const { user } = useAuth();
  const {
    listings,
    loading,
    error,
    tier,
    tierLabel,
    selectedCountry,
    fetchByGeo,
    fetchByScope,
    createListing,
    updateListing,
    deleteListing,
    toggleSave,
    isSaved,
  } = useMarketplace();

  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkId = searchParams.get('id');

  const [isSellerVerified, setIsSellerVerified] = useState(false);
  const [filters, setFilters] = useState<MarketplaceFilters>(DEFAULT_FILTERS);
  // Stable "now" captured at mount for the newOnly (<24h) filter. Good enough
  // for day-granularity filtering without re-triggering the memo every render.
  const [filterNowMs] = useState(() => Date.now());
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // City options for the top-level location dropdown
  const cityOptions = [
    'All Locations',
    ...Object.keys(GLOBAL_LOCATIONS[selectedCountry] ?? {}),
  ];

  // Area options populate from GLOBAL_LOCATIONS once a city is chosen
  const cityAreas: string[] =
    filters.location !== 'All Locations'
      ? (GLOBAL_LOCATIONS[selectedCountry]?.[filters.location] ?? [])
      : [];

  // Drive fetch whenever country, city, or area selection changes
  useEffect(() => {
    if (filters.area) {
      fetchByGeo(
        filters.area,
        filters.location !== 'All Locations' ? filters.location : undefined,
      );
    } else {
      fetchByScope(
        filters.location !== 'All Locations' ? filters.location : undefined,
      );
    }
  }, [filters.location, filters.area, fetchByGeo, fetchByScope]);

  // Keep detail modal in sync with local state updates (e.g. after edit)
  useEffect(() => {
    if (!selectedListing) return;
    const updated = listings.find(l => l.id === selectedListing.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: keep open modal in sync with Firestore updates
    if (updated) setSelectedListing(updated);
  }, [listings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link support: open a listing's detail modal when arriving via
  // /marketplace?id=<listingId> (e.g. from the HomePage "Latest Drops" carousel).
  // The listing may not be in the country-scoped fetch, so resolve it directly
  // from Firestore by document id.
  useEffect(() => {
    if (!deepLinkId) return;
    let cancelled = false;
    const local = listings.find(l => l.id === deepLinkId);
    if (local) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open modal from deep-link param
      setSelectedListing(local);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'listings', deepLinkId));
        if (cancelled || !snap.exists()) return;
        const data = snap.data();
        if (cancelled) return;
        setSelectedListing({
          ...(data as Omit<Listing, 'id' | 'postedDate'>),
          id: snap.id,
          postedDate:
            data.postedDate instanceof Timestamp
              ? data.postedDate.toDate().toISOString()
              : String(data.postedDate ?? ''),
        });
      } catch {
        // Silently degrade — invalid/missing id simply won't open a modal
      }
    })();
    return () => { cancelled = true; };
  }, [deepLinkId, listings]);

  // Close the detail modal and strip the deep-link param so it doesn't reopen.
  const closeDetail = () => {
    setSelectedListing(null);
    if (deepLinkId) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('id');
        return next;
      }, { replace: true });
    }
  };

  useEffect(() => {
    const uid = user?.uid;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to false when user logs out
    if (!uid) { setIsSellerVerified(false); return; }
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      snap => setIsSellerVerified(snap.data()?.isVerified === true),
      () => setIsSellerVerified(false),
    );
    return unsub;
  }, [user?.uid]);

  const setFilter = <K extends keyof MarketplaceFilters>(
    key: K,
    value: MarketplaceFilters[K],
  ) => setFilters(prev => ({ ...prev, [key]: value }));

  // Clear area when city changes
  const handleCityChange = (city: string) =>
    setFilters(prev => ({ ...prev, location: city, area: '' }));

  // Client-side post-processing: category, search text, condition, type, price, sort
  // (geo filtering is now done server-side by the FastAPI endpoint)
  const filteredListings = useMemo(() => {
    return listings
      .filter(l => filters.category === 'all' || l.category === filters.category)
      .filter(l => {
        if (!filters.search) return true;
        const q = filters.search.toLowerCase();
        return (
          l.title.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.tags.some(t => t.toLowerCase().includes(q))
        );
      })
      .filter(l => !filters.conditions.length || filters.conditions.includes(l.condition))
      .filter(l => filters.listingType === 'all' || l.listingType === filters.listingType)
      .filter(l => filters.priceMin === null || l.price >= filters.priceMin)
      .filter(l => filters.priceMax === null || l.price <= filters.priceMax)
      .filter(l => !filters.newOnly || filterNowMs - new Date(l.postedDate).getTime() < DAY_MS)
      .sort((a, b) => {
        switch (filters.sortBy) {
          case 'oldest':
            return new Date(a.postedDate).getTime() - new Date(b.postedDate).getTime();
          case 'price_asc':
            return a.price - b.price;
          case 'price_desc':
            return b.price - a.price;
          case 'most_viewed':
            return b.views - a.views;
          default:
            return new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime();
        }
      });
  }, [listings, filters, filterNowMs]);

  const handlePostClick = () => {
    if (!user) { onOpenAuth('login'); return; }
    setShowCreate(true);
  };

  const handleSave = (listingId: string) => {
    if (!user) { onOpenAuth('login'); return; }
    toggleSave(user.uid, listingId);
  };

  const handleCreate = async (
    listing: Omit<Listing, 'id' | 'views' | 'savedBy' | 'postedDate'>,
  ): Promise<void> => {
    await createListing(listing);
  };

  const handleDeleteListing = async () => {
    if (!selectedListing) return;
    await deleteListing(selectedListing.id);
    closeDetail();
  };

  const handleEditListing = () => {
    if (!selectedListing) return;
    setEditingListing(selectedListing);
    setSelectedListing(null);
  };

  const handleEditSubmit = async (
    data: Omit<Listing, 'id' | 'views' | 'savedBy' | 'postedDate'>,
  ) => {
    if (!editingListing) return;
    await updateListing(editingListing.id, data);
    setSelectedListing({ ...editingListing, ...data });
    setEditingListing(null);
  };

  const handleEditClose = () => {
    setSelectedListing(editingListing);
    setEditingListing(null);
  };

  const activeFilterCount = [
    filters.conditions.length > 0,
    filters.listingType !== 'all',
    filters.priceMin !== null,
    filters.priceMax !== null,
    filters.location !== 'All Locations',
    !!filters.area,
    filters.newOnly,
  ].filter(Boolean).length;

  const hasActiveFilters =
    activeFilterCount > 0 || !!filters.search || filters.category !== 'all';

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto w-full">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Marketplace</h1>
            <p className="text-gray-500 text-sm mt-1">
              {loading
                ? 'Loading listings...'
                : `${filteredListings.length} listing${filteredListings.length !== 1 ? 's' : ''} found`}
            </p>
          </div>
          <button
            onClick={handlePostClick}
            className="px-6 py-3 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-pill transition-all shadow-[0_0_15px_rgba(13,242,242,0.4)] flex items-center gap-2 text-sm"
          >
            <span className="material-symbols-outlined text-base leading-none">add</span>
            Post a Listing
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6">
            <span className="material-symbols-outlined text-base leading-none">error</span>
            {error}
          </div>
        )}

        {/* Search & Location Bar */}
        <div className="glass-panel p-2 md:p-3 rounded-[2rem] border border-black/10 dark:border-white/10 shadow-neon mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent-purple/5 pointer-events-none" />
          <div className="flex flex-col md:flex-row gap-2 relative z-10">

            {/* City dropdown */}
            <div className="flex items-center px-4 py-3 bg-bg-panel border border-border-glass rounded-pill md:w-52 group focus-within:border-primary/50 transition-colors">
              <span className="material-symbols-outlined text-primary mr-2 shrink-0">location_on</span>
              <select
                value={filters.location}
                onChange={e => handleCityChange(e.target.value)}
                className="bg-transparent border-none text-sm focus:ring-0 w-full cursor-pointer appearance-none p-0"
              >
                {cityOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <span className="material-symbols-outlined text-gray-500 text-sm shrink-0">expand_more</span>
            </div>

            {/* Area dropdown — visible when a city with known areas is selected */}
            {cityAreas.length > 0 && (
              <div className="flex items-center px-4 py-3 bg-bg-panel border border-border-glass rounded-pill md:w-52 group focus-within:border-primary/50 transition-colors">
                <span className="material-symbols-outlined text-primary mr-2 shrink-0">pin_drop</span>
                <select
                  value={filters.area ?? ''}
                  onChange={e => setFilter('area', e.target.value)}
                  className="bg-transparent border-none text-sm focus:ring-0 w-full cursor-pointer appearance-none p-0"
                >
                  <option value="">All Areas</option>
                  {cityAreas.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <span className="material-symbols-outlined text-gray-500 text-sm shrink-0">expand_more</span>
              </div>
            )}

            {/* Text search */}
            <div className="flex flex-grow items-center px-4 py-3 bg-bg-panel border border-border-glass rounded-pill group focus-within:border-primary/50 transition-colors">
              <span className="material-symbols-outlined text-gray-400 mr-2 group-focus-within:text-primary transition-colors shrink-0">search</span>
              <input
                type="text"
                value={filters.search}
                onChange={e => setFilter('search', e.target.value)}
                placeholder="Search for GPUs, Keyboards, Monitors..."
                className="w-full bg-transparent border-none text-sm focus:ring-0 p-0 placeholder-[var(--text-muted)]"
              />
              {filters.search && (
                <button
                  onClick={() => setFilter('search', '')}
                  className="text-gray-500 hover:text-[var(--text-base)] transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-sm leading-none">close</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Geo-search tier indicator */}
        {tierLabel && (
          <div className="flex items-center gap-2 text-xs text-primary/70 font-mono mb-4 px-1">
            <span className="material-symbols-outlined text-sm leading-none">location_searching</span>
            Showing: {tierLabel}
            {tier === 2 && <span className="text-gray-500"> (radius expansion)</span>}
            {tier === 3 && <span className="text-gray-500"> (city-wide)</span>}
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-3 mb-6">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilter('category', cat.id)}
              className={`px-5 py-2.5 glass-panel rounded-pill flex items-center gap-2 hover:bg-black/8 dark:hover:bg-white/10 hover:border-primary/50 transition-all group ${filters.category === cat.id ? 'bg-black/8 dark:bg-white/10 border-primary/50' : ''}`}
            >
              <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">{cat.icon}</span>
              <span className={`text-sm font-medium ${filters.category === cat.id ? '' : 'text-[var(--text-muted)]'}`}>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* Filter / Sort Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2 px-4 py-2.5 glass-panel border border-border-glass rounded-xl text-sm">
            <span className="material-symbols-outlined text-base text-gray-400 leading-none">sort</span>
            <select
              value={filters.sortBy}
              onChange={e => setFilter('sortBy', e.target.value as MarketplaceFilters['sortBy'])}
              className="bg-transparent border-none text-sm focus:ring-0 cursor-pointer appearance-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="most_viewed">Most Viewed</option>
            </select>
          </div>

          <div className="flex glass-panel border border-border-glass rounded-xl overflow-hidden">
            {(['all', 'sell', 'buy', 'exchange'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilter('listingType', type)}
                className={`px-4 py-2.5 text-sm capitalize transition-colors ${filters.listingType === type ? 'bg-primary text-bg-dark font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                {type === 'all' ? 'All Types' : type}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-all ${showFilters || activeFilterCount > 0 ? 'border-primary/50 text-primary bg-primary/10' : 'glass-panel border-border-glass text-[var(--text-muted)] hover:border-primary/30 hover:text-[var(--text-base)]'}`}
          >
            <span className="material-symbols-outlined text-base leading-none">tune</span>
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-primary text-bg-dark rounded-full w-5 h-5 text-xs flex items-center justify-center font-bold">{activeFilterCount}</span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-sm text-gray-500 hover:text-white transition-colors underline"
            >
              Clear all
            </button>
          )}

          <span className="ml-auto text-sm text-gray-600">
            {filteredListings.length} result{filteredListings.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Advanced Filter Panel */}
        {showFilters && (
          <div className="glass-panel rounded-[1.5rem] border border-border-glass p-5 mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-sm text-gray-400 mb-3 block uppercase tracking-wider text-xs">Price Range (PKR)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={filters.priceMin ?? ''}
                  onChange={e => setFilter('priceMin', e.target.value ? Number(e.target.value) : null)}
                  placeholder="Min"
                  min="0"
                  className="w-full bg-bg-panel border border-border-glass rounded-xl px-3 py-2.5 text-sm placeholder-[var(--text-muted)] focus:border-primary/50 focus:outline-none"
                />
                <span className="text-[var(--text-muted)] shrink-0">—</span>
                <input
                  type="number"
                  value={filters.priceMax ?? ''}
                  onChange={e => setFilter('priceMax', e.target.value ? Number(e.target.value) : null)}
                  placeholder="Max"
                  min="0"
                  className="w-full bg-bg-panel border border-border-glass rounded-xl px-3 py-2.5 text-sm placeholder-[var(--text-muted)] focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-3 block uppercase tracking-wider text-xs">Condition</label>
              <div className="flex gap-2 flex-wrap">
                {(['new', 'used', 'refurbished'] as const).map(cond => {
                  const active = filters.conditions.includes(cond);
                  return (
                    <button
                      key={cond}
                      onClick={() =>
                        setFilter(
                          'conditions',
                          active
                            ? filters.conditions.filter(c => c !== cond)
                            : [...filters.conditions, cond],
                        )
                      }
                      className={`px-4 py-2 rounded-xl text-sm capitalize transition-all ${active ? 'bg-primary text-bg-dark font-bold' : 'bg-black/5 dark:bg-white/5 text-[var(--text-muted)] hover:bg-black/10 dark:hover:bg-white/10'}`}
                    >
                      {cond}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-3 block uppercase tracking-wider text-xs">Quick Filters</label>
              <div className="flex flex-col gap-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="accent-primary w-4 h-4"
                    checked={filters.listingType === 'exchange'}
                    onChange={e => setFilter('listingType', e.target.checked ? 'exchange' : 'all')}
                  />
                  <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-base)] transition-colors">Exchange only</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="accent-primary w-4 h-4"
                    checked={filters.newOnly}
                    onChange={e => setFilter('newOnly', e.target.checked)}
                  />
                  <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-base)] transition-colors">New listings (24h)</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Listings Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass-panel rounded-[2rem] border border-border-glass overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-black/5 dark:bg-white/5" />
                <div className="p-4 flex flex-col gap-3">
                  <div className="h-4 bg-black/5 dark:bg-white/5 rounded-full w-3/4" />
                  <div className="h-6 bg-black/5 dark:bg-white/5 rounded-full w-1/2" />
                  <div className="h-3 bg-black/5 dark:bg-white/5 rounded-full w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredListings.length > 0 ? (
              filteredListings.map(listing => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  savedByCurrentUser={user ? isSaved(user.uid, listing.id) : false}
                  onClick={() => setSelectedListing(listing)}
                  onSave={e => { e.stopPropagation(); handleSave(listing.id); }}
                />
              ))
            ) : listings.length === 0 && !hasActiveFilters ? (
              <NewsFallback country={selectedCountry} context="marketplace" />
            ) : (
              <div className="col-span-full flex items-center justify-center py-20">
                <div className="text-center">
                  <span className="material-symbols-outlined text-6xl text-gray-700 block mb-4">store</span>
                  <p className="text-gray-400 font-medium text-lg">No listings found</p>
                  <p className="text-gray-600 text-sm mt-1">Try adjusting your filters</p>
                  {hasActiveFilters && (
                    <button
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                      className="mt-4 px-5 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {selectedListing && (
        <ListingDetailModal
          listing={selectedListing}
          savedByCurrentUser={user ? isSaved(user.uid, selectedListing.id) : false}
          isLoggedIn={!!user}
          onClose={closeDetail}
          onSave={() => handleSave(selectedListing.id)}
          currentUserId={user?.uid}
          onDelete={handleDeleteListing}
          onEdit={handleEditListing}
        />
      )}

      {showCreate && user && (
        <CreateListingModal
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          sellerId={user.uid}
          sellerName={user.displayName ?? 'Anonymous'}
          sellerContact={user.email ?? ''}
          isVerified={isSellerVerified}
        />
      )}

      {editingListing && user && (
        <CreateListingModal
          onClose={handleEditClose}
          onSubmit={handleEditSubmit}
          sellerId={user.uid}
          sellerName={user.displayName ?? 'Anonymous'}
          sellerContact={user.email ?? ''}
          isVerified={isSellerVerified}
          initialListing={editingListing}
        />
      )}
    </>
  );
}
