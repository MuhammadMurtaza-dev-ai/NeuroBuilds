import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../Firebase';
import { useMarketplace, DEFAULT_FILTERS } from '../hooks/useMarketplace';
import type { MarketplaceFilters } from '../hooks/useMarketplace';
import { useAuth } from '../hooks/useAuth';
import { useAdvertisements } from '../hooks/useAdvertisements';
import {
  getPakistanProvinces,
  getCitiesForProvince,
  getAreasForCity,
} from '../data/pakistanGeoLocations';
import { GLOBAL_LOCATIONS } from '../data/globalLocations';
import GradientBackground from '../components/GradientBackground/GradientBackground';
import ListingCard from '../components/Marketplace/ListingCard';
import ListingDetailModal from '../components/Marketplace/ListingDetailModal';
import CreateListingModal from '../components/Marketplace/CreateListingModal';
import MarketplaceControls from '../components/Marketplace/MarketplaceControls';
import MarketplaceAdCard from '../components/Marketplace/MarketplaceAdCard';
import NewsFallback from '../components/NewsFallback/NewsFallback';
import type { Listing } from '../hooks/useStorage';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  sold: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  reserved: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  hidden: 'bg-red-500/20 text-red-400 border-red-500/30',
  expired: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const DAY_MS = 86_400_000;

type ViewMode = 'all' | 'mine' | 'saved';

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
    fetchByLocation,
    fetchByScope,
    fetchMine,
    fetchSaved,
    createListing,
    updateListing,
    deleteListing,
    toggleSave,
    isSaved,
    markAsSold,
    reactivateListing,
  } = useMarketplace();

  // Sponsored ad slots interleaved into the classifieds grid.
  const { ads: gridAds } = useAdvertisements('marketplace_grid');

  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkId = searchParams.get('id');
  const tagParam = (searchParams.get('tag') ?? '').trim();

  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [isSellerVerified, setIsSellerVerified] = useState(false);
  const [sellerPhone, setSellerPhone] = useState('');
  const [filters, setFilters] = useState<MarketplaceFilters>(DEFAULT_FILTERS);
  const [filterNowMs] = useState(() => Date.now());
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── Location cascade data ────────────────────────────────────────────────────
  const isPakistan = selectedCountry === 'Pakistan';

  const provinces = isPakistan
    ? getPakistanProvinces()
    : Object.keys(GLOBAL_LOCATIONS[selectedCountry] ?? {});

  const cities: string[] = useMemo(() => {
    if (!filters.province) return [];
    if (isPakistan) return getCitiesForProvince(filters.province).map(c => c.name);
    return GLOBAL_LOCATIONS[selectedCountry]?.[filters.province] ?? [];
  }, [filters.province, isPakistan, selectedCountry]);

  const areas: string[] = useMemo(() => {
    if (!isPakistan || !filters.province || !filters.location || filters.location === 'All Locations') return [];
    return getAreasForCity(filters.province, filters.location).map(a => a.name);
  }, [isPakistan, filters.province, filters.location]);

  // ── Drive fetch on location/viewMode change ──────────────────────────────────
  useEffect(() => {
    if (viewMode === 'mine') {
      if (!user) return;
      fetchMine(user.uid);
      return;
    }
    if (viewMode === 'saved') {
      if (!user) return;
      fetchSaved(user.uid);
      return;
    }
    // 'all' view
    if (filters.area) {
      fetchByLocation({
        area: filters.area,
        city: filters.location !== 'All Locations' ? filters.location : undefined,
        province: filters.province || undefined,
      });
    } else if (filters.location !== 'All Locations') {
      fetchByLocation({
        city: filters.location,
        province: filters.province || undefined,
      });
    } else if (filters.province) {
      fetchByScope();
    } else {
      fetchByScope();
    }
  }, [viewMode, filters.province, filters.location, filters.area, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep detail modal in sync with updates
  useEffect(() => {
    if (!selectedListing) return;
    const updated = listings.find(l => l.id === selectedListing.id);
    if (updated) setSelectedListing(updated);
  }, [listings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link support
  useEffect(() => {
    if (!deepLinkId) return;
    let cancelled = false;
    const local = listings.find(l => l.id === deepLinkId);
    if (local) {
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
        // Silently degrade
      }
    })();
    return () => { cancelled = true; };
  }, [deepLinkId, listings]);

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

  // Watch seller verification status
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) { setIsSellerVerified(false); setSellerPhone(''); return; }
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        setIsSellerVerified(snap.data()?.isVerified === true);
        setSellerPhone(typeof snap.data()?.phoneNumber === 'string' ? snap.data()!.phoneNumber : '');
      },
      () => { setIsSellerVerified(false); setSellerPhone(''); },
    );
    return unsub;
  }, [user?.uid]);

  const setFilter = <K extends keyof MarketplaceFilters>(
    key: K,
    value: MarketplaceFilters[K],
  ) => setFilters(prev => ({ ...prev, [key]: value }));

  const handleProvinceChange = (province: string) =>
    setFilters(prev => ({ ...prev, province, location: 'All Locations', area: '' }));

  const handleCityChange = (city: string) =>
    setFilters(prev => ({ ...prev, location: city, area: '' }));

  const switchViewMode = (mode: ViewMode) => {
    if ((mode === 'mine' || mode === 'saved') && !user) {
      onOpenAuth('login');
      return;
    }
    setViewMode(mode);
    setSelectedListing(null);
  };

  // Client-side post-processing for 'all' view
  const filteredListings = useMemo(() => {
    const tagQuery = tagParam.replace(/^#/, '').toLowerCase();
    const base = viewMode === 'all'
      ? listings
      : listings; // mine/saved already scoped by fetch

    return base
      .filter(l => filters.category === 'all' || l.category === filters.category)
      .filter(l =>
        !tagQuery ||
        l.tags.some(t => t.replace(/^#/, '').toLowerCase() === tagQuery))
      .filter(l => {
        if (!filters.search) return true;
        const q = filters.search.replace(/^#/, '').toLowerCase();
        return (
          l.title.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.tags.some(t => t.replace(/^#/, '').toLowerCase().includes(q))
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
  }, [listings, filters, filterNowMs, tagParam, viewMode]);

  const clearTag = () =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('tag');
      return next;
    }, { replace: true });

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

  const handleStatusToggle = async (listing: Listing) => {
    setBusyId(listing.id);
    try {
      if (listing.status === 'active') {
        await markAsSold(listing.id);
      } else {
        await reactivateListing(listing.id);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteOwned = async (listing: Listing) => {
    if (!window.confirm('Permanently delete this listing? This cannot be undone.')) return;
    setBusyId(listing.id);
    try {
      await deleteListing(listing.id);
    } finally {
      setBusyId(null);
    }
  };

  const activeFilterCount = [
    filters.conditions.length > 0,
    filters.listingType !== 'all',
    filters.priceMin !== null,
    filters.priceMax !== null,
    !!filters.province,
    filters.location !== 'All Locations',
    !!filters.area,
    filters.newOnly,
  ].filter(Boolean).length;

  const hasActiveFilters =
    activeFilterCount > 0 || !!filters.search || filters.category !== 'all';

  const isAllView = viewMode === 'all';

  // ── Sponsored ad slots: 4 featured (top) + 4 normal (after first 6 listings) ──
  const featuredAds = gridAds.filter(a => a.featured).slice(0, 4);
  const normalAds = gridAds.filter(a => !a.featured).slice(0, 4);

  const controlsProps = {
    filters,
    setFilter,
    provinces,
    cities,
    areas,
    onProvinceChange: handleProvinceChange,
    onCityChange: handleCityChange,
    hasActiveFilters,
    onClearAll: () => setFilters(DEFAULT_FILTERS),
  };

  const renderListingCard = (listing: Listing) => (
    <ListingCard
      key={listing.id}
      listing={listing}
      savedByCurrentUser={user ? isSaved(user.uid, listing.id) : false}
      onClick={() => setSelectedListing(listing)}
      onSave={e => { e.stopPropagation(); handleSave(listing.id); }}
    />
  );

  const gridClass = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6';

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto w-full">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
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

        {/* View Mode Tabs */}
        <div className="flex items-center gap-1 mb-6 glass-panel rounded-2xl p-1 w-fit border border-white/10">
          {(['all', 'mine', 'saved'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => switchViewMode(mode)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                viewMode === mode
                  ? 'bg-primary text-bg-dark shadow-[0_0_12px_rgba(13,242,242,0.3)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base leading-none">
                {mode === 'all' ? 'storefront' : mode === 'mine' ? 'sell' : 'favorite'}
              </span>
              {mode === 'all' ? 'All Listings' : mode === 'mine' ? 'My Listings' : 'Saved'}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6">
            <span className="material-symbols-outlined text-base leading-none">error</span>
            {error}
          </div>
        )}

        {isAllView ? (
          /* ── All view: left control sidebar + classifieds grid ── */
          <div className="lg:flex lg:gap-6 lg:items-start">
            {/* Desktop sidebar */}
            <aside className="hidden lg:block lg:w-72 shrink-0 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto pr-1">
              <div className="glass-panel rounded-[1.5rem] border border-border-glass p-5">
                <MarketplaceControls {...controlsProps} />
              </div>
            </aside>

            {/* Mobile filters toggle + collapsible panel */}
            <div className="lg:hidden mb-6">
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-all w-full justify-center ${
                  showFilters || activeFilterCount > 0
                    ? 'border-primary/50 text-primary bg-primary/10'
                    : 'glass-panel border-border-glass text-[var(--text-muted)]'
                }`}
              >
                <span className="material-symbols-outlined text-base leading-none">tune</span>
                Filters &amp; Sort
                {activeFilterCount > 0 && (
                  <span className="bg-primary text-bg-dark rounded-full w-5 h-5 text-xs flex items-center justify-center font-bold">{activeFilterCount}</span>
                )}
              </button>
              {showFilters && (
                <div className="glass-panel rounded-[1.5rem] border border-border-glass p-5 mt-3">
                  <MarketplaceControls {...controlsProps} />
                </div>
              )}
            </div>

            {/* Right column — listings */}
            <div className="flex-1 min-w-0">
              {/* Active hashtag filter chip */}
              {tagParam && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-gray-500">Filtered by hashtag:</span>
                  <button
                    onClick={clearTag}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
                  >
                    #{tagParam.replace(/^#/, '')}
                    <span className="material-symbols-outlined text-sm leading-none">close</span>
                  </button>
                </div>
              )}

              {/* Geo-search tier indicator */}
              {tierLabel && (
                <div className="flex items-center gap-2 text-xs text-primary/70 font-mono mb-4 px-1">
                  <span className="material-symbols-outlined text-sm leading-none">location_searching</span>
                  Showing: {tierLabel}
                  {tier === 2 && <span className="text-gray-500"> (city-wide fallback)</span>}
                </div>
              )}

              {loading ? (
                <div className={gridClass}>
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
              ) : filteredListings.length > 0 ? (
                <div className={gridClass}>
                  {featuredAds.map(ad => <MarketplaceAdCard key={`ad-f-${ad.id}`} ad={ad} />)}
                  {filteredListings.slice(0, 6).map(renderListingCard)}
                  {normalAds.map(ad => <MarketplaceAdCard key={`ad-n-${ad.id}`} ad={ad} />)}
                  {filteredListings.slice(6).map(renderListingCard)}
                </div>
              ) : listings.length === 0 && !hasActiveFilters ? (
                <NewsFallback country={selectedCountry} context="marketplace" />
              ) : (
                <div className="flex items-center justify-center py-20">
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
          </div>
        ) : (
          /* ── Mine / Saved views (full width, no sidebar) ── */
          <>
            {/* Search bar */}
            <div className="glass-panel p-2 md:p-3 rounded-[2rem] border border-black/10 dark:border-white/10 mb-6">
              <div className="flex items-center px-4 py-3 bg-bg-panel border border-border-glass rounded-pill">
                <span className="material-symbols-outlined text-gray-400 mr-2">search</span>
                <input
                  type="text"
                  value={filters.search}
                  onChange={e => setFilter('search', e.target.value)}
                  placeholder={viewMode === 'mine' ? 'Search your listings...' : 'Search saved items...'}
                  className="w-full bg-transparent border-none text-sm focus:ring-0 p-0 placeholder-[var(--text-muted)]"
                />
              </div>
            </div>

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
            ) : viewMode === 'mine' ? (
              /* ── My Listings grid with management actions ── */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredListings.length > 0 ? filteredListings.map(listing => (
                  <div key={listing.id} className="glass-panel rounded-[2rem] border border-border-glass overflow-hidden flex flex-col">
                    <button
                      type="button"
                      onClick={() => setSelectedListing(listing)}
                      className="aspect-[4/3] bg-bg-panel overflow-hidden relative group/img"
                    >
                      {listing.images?.[0] ? (
                        <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-5xl text-gray-700">image</span>
                        </div>
                      )}
                      {listing.status !== 'active' && (
                        <div className={`absolute top-2 right-2 px-2.5 py-1 rounded-full text-[10px] font-bold border capitalize ${STATUS_COLORS[listing.status] ?? STATUS_COLORS.active}`}>
                          {listing.status}
                        </div>
                      )}
                    </button>
                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <p className="font-semibold text-sm line-clamp-2 leading-snug">{listing.title}</p>
                      <p className="text-primary font-mono font-bold text-sm">Rs. {listing.price.toLocaleString()}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="material-symbols-outlined text-xs leading-none">visibility</span>
                        {listing.views} views
                        {listing.expiresAt && listing.status === 'active' && (
                          <>
                            <span>·</span>
                            <span className="text-orange-400">
                              Expires {new Date(listing.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex gap-1.5 mt-auto pt-2 flex-wrap">
                        <Link
                          to={`/marketplace?id=${listing.id}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-primary/40 transition-all"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleStatusToggle(listing)}
                          disabled={busyId === listing.id}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                            listing.status === 'active'
                              ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                              : 'bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20'
                          }`}
                        >
                          {listing.status === 'active' ? 'Mark Sold' : 'Reactivate'}
                        </button>
                        <button
                          onClick={() => handleDeleteOwned(listing)}
                          disabled={busyId === listing.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-500/30 transition-all disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                    <span className="material-symbols-outlined text-6xl text-gray-700 mb-4">sell</span>
                    <p className="text-gray-400 font-medium text-lg">No listings yet</p>
                    <p className="text-gray-600 text-sm mt-1 mb-6">Post your first item on the marketplace</p>
                    <button
                      onClick={handlePostClick}
                      className="px-6 py-3 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-pill transition-all text-sm"
                    >
                      Post a Listing
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* ── Saved grid ── */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredListings.length > 0 ? (
                  filteredListings.map(renderListingCard)
                ) : (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                    <span className="material-symbols-outlined text-6xl text-gray-700 mb-4">favorite</span>
                    <p className="text-gray-400 font-medium text-lg">No saved items</p>
                    <p className="text-gray-600 text-sm mt-1">Bookmark listings you're interested in buying</p>
                  </div>
                )}
              </div>
            )}
          </>
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
          sellerPhone={sellerPhone}
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
          sellerPhone={sellerPhone}
          isVerified={isSellerVerified}
          initialListing={editingListing}
        />
      )}
    </>
  );
}
