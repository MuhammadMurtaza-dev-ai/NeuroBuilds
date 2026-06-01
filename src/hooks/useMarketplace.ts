import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  limit,
  increment,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../Firebase';
import type { Listing } from './useStorage';
import { useCountry } from '../context/CountryContext';
import { getNearbyAreaNames, getCityForArea } from '../data/pakistanGeoLocations';

export interface MarketplaceFilters {
  category: string;
  search: string;
  /** City-level filter — "All Locations" disables it. */
  location: string;
  /** Specific area within a city (enables Tier 1/2/3 fallback when set). */
  area?: string;
  /** Province filter — used for province-scoped browsing. */
  province?: string;
  conditions: string[];
  listingType: string;
  priceMin: number | null;
  priceMax: number | null;
  sortBy: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'most_viewed';
  newOnly: boolean;
}

// ─── Geo-fallback result ──────────────────────────────────────────────────────

export type FallbackTier = 1 | 2 | 3;

export interface GeoSearchResult {
  listings: Listing[];
  tier: FallbackTier;
  /** Human-readable label shown in the UI ("Tariq Garden" | "Nearby Tariq Garden" | "All of Lahore") */
  tierLabel: string;
}

export const DEFAULT_FILTERS: MarketplaceFilters = {
  category: 'all',
  search: '',
  location: 'All Locations',
  area: '',
  province: '',
  conditions: [],
  listingType: 'all',
  priceMin: null,
  priceMax: null,
  sortBy: 'newest',
  newOnly: false,
};

const LISTINGS_COLLECTION = 'listings';
const DAY_MS = 86_400_000;

const docToListing = (id: string, data: DocumentData): Listing => ({
  ...(data as Omit<Listing, 'id' | 'postedDate'>),
  id,
  postedDate: data.postedDate instanceof Timestamp
    ? data.postedDate.toDate().toISOString()
    : String(data.postedDate ?? ''),
});

export const useMarketplace = () => {
  const { selectedCountry } = useCountry();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setListings([]);

    const fetchListings = async () => {
      setLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, LISTINGS_COLLECTION),
          where('country', '==', selectedCountry),
          limit(50)
        );
        const snapshot = await getDocs(q);
        if (!cancelled) {
          setListings(snapshot.docs.map(d => docToListing(d.id, d.data())));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load listings');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchListings();
    return () => { cancelled = true; };
  }, [selectedCountry]);

  const loadMore = async (): Promise<void> => { /* no-op: all listings fetched at once */ };

  const getFilteredListings = (filters: Partial<MarketplaceFilters> = {}): Listing[] => {
    const f = { ...DEFAULT_FILTERS, ...filters };
    return listings
      .filter(l => l.status === 'active')
      .filter(l => f.category === 'all' || l.category === f.category)
      .filter(l => {
        if (!f.search) return true;
        const q = f.search.toLowerCase();
        return (
          l.title.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.tags.some(t => t.toLowerCase().includes(q))
        );
      })
      .filter(l => f.location === 'All Locations' || l.location.includes(f.location))
      .filter(l => !f.conditions.length || f.conditions.includes(l.condition))
      .filter(l => f.listingType === 'all' || l.listingType === f.listingType)
      .filter(l => f.priceMin === null || l.price >= f.priceMin)
      .filter(l => f.priceMax === null || l.price <= f.priceMax)
      .filter(l => !f.newOnly || Date.now() - new Date(l.postedDate).getTime() < DAY_MS)
      .sort((a, b) => {
        switch (f.sortBy) {
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
  };

  const createListing = async (
    listing: Omit<Listing, 'id' | 'views' | 'savedBy' | 'postedDate'>
  ): Promise<Listing> => {
    try {
      const postedDate = Timestamp.now();
      const docRef = await addDoc(collection(db, LISTINGS_COLLECTION), {
        ...listing,
        country: listing.country || selectedCountry,
        views: 0,
        savedBy: [],
        postedDate,
      });
      const newListing: Listing = {
        ...listing,
        country: listing.country || selectedCountry,
        id: docRef.id,
        views: 0,
        savedBy: [],
        postedDate: postedDate.toDate().toISOString(),
      };
      setListings(prev => [newListing, ...prev]);
      return newListing;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing');
      throw err;
    }
  };

  const updateListing = async (id: string, updates: Partial<Listing>): Promise<void> => {
    try {
      const firestoreUpdates: DocumentData = { ...updates };
      if (updates.postedDate) {
        firestoreUpdates.postedDate = Timestamp.fromDate(new Date(updates.postedDate));
      }
      await updateDoc(doc(db, LISTINGS_COLLECTION, id), firestoreUpdates);
      setListings(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update listing');
      throw err;
    }
  };

  const deleteListing = async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, LISTINGS_COLLECTION, id));
      setListings(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete listing');
      throw err;
    }
  };

  const toggleSave = async (userId: string, listingId: string): Promise<void> => {
    const listing = listings.find(l => l.id === listingId);
    if (!listing) return;
    const saved = listing.savedBy.includes(userId);
    try {
      await updateListing(listingId, {
        savedBy: saved
          ? listing.savedBy.filter(id => id !== userId)
          : [...listing.savedBy, userId],
      });
    } catch {
      // error already surfaced via setError in updateListing
    }
  };

  const isSaved = (userId: string, listingId: string): boolean => {
    const listing = listings.find(l => l.id === listingId);
    return listing ? listing.savedBy.includes(userId) : false;
  };

  const updateStock = async (id: string, delta: number): Promise<void> => {
    try {
      await updateDoc(doc(db, LISTINGS_COLLECTION, id), { stockQuantity: increment(delta) });
      setListings(prev =>
        prev.map(l =>
          l.id === id
            ? { ...l, stockQuantity: Math.max(0, (l.stockQuantity ?? 0) + delta) }
            : l
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update stock');
      throw err;
    }
  };

  const markAsSold = (id: string) => updateListing(id, { status: 'sold' });
  const markAsReserved = (id: string) => updateListing(id, { status: 'reserved' });
  const reactivateListing = (id: string) => updateListing(id, { status: 'active' });

  const getUserListings = (userId: string) => listings.filter(l => l.sellerId === userId);
  const getSavedListings = (userId: string) => listings.filter(l => l.savedBy.includes(userId));

  /**
   * Cascading geo-fallback search — for Pakistan marketplace with area-level precision.
   *
   * Tier 1 — Exact area match:   location includes `areaName`
   * Tier 2 — Radius expansion:   location includes any area within `radiusKm` of `areaName`
   * Tier 3 — City-wide fallback: location includes the city that contains `areaName`
   *
   * Only active listings are considered. The base `filters` (category, price, etc.) are
   * applied after the tier resolution so geo results are still filterable.
   *
   * @param areaName  The area the user searched for (e.g. "Tariq Garden")
   * @param baseFilters  Optional subset of MarketplaceFilters to apply on top
   * @param radiusKm  Radius for Tier-2 expansion (default 8 km)
   */
  const searchWithGeoFallback = (
    areaName: string,
    baseFilters: Partial<MarketplaceFilters> = {},
    radiusKm = 8,
  ): GeoSearchResult => {
    const active = listings.filter(l => l.status === 'active');
    const f = { ...DEFAULT_FILTERS, ...baseFilters };

    const applyBaseFilters = (pool: Listing[]) =>
      pool
        .filter(l => f.category === 'all' || l.category === f.category)
        .filter(l => f.listingType === 'all' || l.listingType === f.listingType)
        .filter(l => !f.conditions.length || f.conditions.includes(l.condition))
        .filter(l => f.priceMin === null || l.price >= f.priceMin)
        .filter(l => f.priceMax === null || l.price <= f.priceMax)
        .filter(l => !f.search || (
          l.title.toLowerCase().includes(f.search.toLowerCase()) ||
          l.description.toLowerCase().includes(f.search.toLowerCase()) ||
          l.tags.some(t => t.toLowerCase().includes(f.search.toLowerCase()))
        ));

    // ── Tier 1: exact area match ──────────────────────────────────────────────
    const tier1 = applyBaseFilters(
      active.filter(l => l.location.toLowerCase().includes(areaName.toLowerCase()))
    );
    if (tier1.length > 0) {
      return { listings: tier1, tier: 1, tierLabel: areaName };
    }

    // ── Tier 2: nearby areas within radius ────────────────────────────────────
    const nearby = getNearbyAreaNames(areaName, radiusKm);
    if (nearby.length > 0) {
      const tier2 = applyBaseFilters(
        active.filter(l => nearby.some(na => l.location.toLowerCase().includes(na.toLowerCase())))
      );
      if (tier2.length > 0) {
        return { listings: tier2, tier: 2, tierLabel: `Nearby ${areaName}` };
      }
    }

    // ── Tier 3: city-wide fallback ────────────────────────────────────────────
    const city = getCityForArea(areaName);
    const tier3 = applyBaseFilters(
      active.filter(l => city ? l.location.toLowerCase().includes(city.toLowerCase()) : false)
    );
    return {
      listings: tier3,
      tier: 3,
      tierLabel: city ? `All of ${city}` : 'All Locations',
    };
  };

  return {
    listings,
    loading,
    loadingMore: false,
    hasMore: false,
    error,
    selectedCountry,
    getFilteredListings,
    loadMore,
    createListing,
    updateListing,
    deleteListing,
    toggleSave,
    isSaved,
    updateStock,
    markAsSold,
    markAsReserved,
    reactivateListing,
    getUserListings,
    getSavedListings,
    searchWithGeoFallback,
  };
};
