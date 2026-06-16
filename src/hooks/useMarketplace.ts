import { useState, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  increment,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../Firebase';
import type { Listing } from './useStorage';
import { useCountry } from '../context/CountryContext';
import { writeAuditLog } from '../utils/auditLog';

export interface MarketplaceFilters {
  category: string;
  search: string;
  /** City-level filter — "All Locations" disables it. */
  location: string;
  /** Area/neighbourhood — when set, drives the FastAPI geo-search. */
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

const AI_URL = (import.meta.env.VITE_AI_SERVICE_URL as string | undefined) ?? 'http://localhost:8000';
const LISTINGS_COLLECTION = 'listings';

const docToListing = (id: string, data: DocumentData): Listing => ({
  ...(data as Omit<Listing, 'id' | 'postedDate'>),
  id,
  postedDate:
    data.postedDate instanceof Timestamp
      ? data.postedDate.toDate().toISOString()
      : String(data.postedDate ?? ''),
});

const apiToListing = (raw: Record<string, unknown>): Listing => ({
  ...(raw as unknown as Listing),
  id: ((raw.id ?? raw._id) as string | undefined) ?? '',
  postedDate:
    typeof raw.postedDate === 'string' ? raw.postedDate : new Date().toISOString(),
  savedBy: Array.isArray(raw.savedBy) ? (raw.savedBy as string[]) : [],
  views: typeof raw.views === 'number' ? raw.views : 0,
});

export const useMarketplace = () => {
  const { selectedCountry } = useCountry();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<number>(0);
  const [tierLabel, setTierLabel] = useState('');

  /**
   * Geo-search via FastAPI — used when an area is selected.
   * `area` must be a valid neighbourhood name from the backend's _AREA_CENTROIDS.
   * `city` narrows the Tier-3 fallback to that city.
   */
  const fetchByGeo = useCallback(async (area: string, city?: string) => {
    setLoading(true);
    setError(null);
    setListings([]);
    try {
      const qs = new URLSearchParams({ area, limit: '30' });
      if (city) qs.set('city', city);
      const res = await fetch(`${AI_URL}/api/marketplace/search?${qs}`);
      if (!res.ok) throw new Error(`Geo-search failed (${res.status})`);
      const json = await res.json() as {
        tier: number;
        tier_label: string;
        listings: Record<string, unknown>[];
      };
      setListings((json.listings ?? []).map(apiToListing));
      setTier(json.tier ?? 3);
      setTierLabel(json.tier_label ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Scoped Firestore fetch — used when no area is selected.
   * Returns the 30 most recent active listings for the selected country,
   * optionally narrowed to a city (matched against the `location` string).
   */
  const fetchByScope = useCallback(async (city?: string) => {
    setLoading(true);
    setError(null);
    setListings([]);
    setTier(0);
    setTierLabel('');
    try {
      const q = query(
        collection(db, LISTINGS_COLLECTION),
        where('country', '==', selectedCountry),
        orderBy('postedDate', 'desc'),
        limit(30),
      );
      const snap = await getDocs(q);
      let mapped = snap.docs
        .map(d => docToListing(d.id, d.data()))
        .filter(l => l.status === 'active');
      if (city) {
        const lc = city.toLowerCase();
        mapped = mapped.filter(l => l.location.toLowerCase().includes(lc));
      }
      setListings(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, [selectedCountry]);

  const createListing = async (
    listing: Omit<Listing, 'id' | 'views' | 'savedBy' | 'postedDate'>,
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
      // Immutable audit trail (§2.2.4) — fire-and-forget, never blocks the create.
      writeAuditLog(listing.sellerId, 'listing.create', {
        targetId: docRef.id,
        targetType: 'listing',
        title: listing.title,
      });
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
      setListings(prev => prev.map(l => (l.id === id ? { ...l, ...updates } : l)));
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
    } catch { /* surfaced via setError in updateListing */ }
  };

  const isSaved = (userId: string, listingId: string): boolean => {
    const listing = listings.find(l => l.id === listingId);
    return listing ? listing.savedBy.includes(userId) : false;
  };

  const updateStock = async (id: string, delta: number): Promise<void> => {
    try {
      await updateDoc(doc(db, LISTINGS_COLLECTION, id), {
        stockQuantity: increment(delta),
      });
      setListings(prev =>
        prev.map(l =>
          l.id === id
            ? { ...l, stockQuantity: Math.max(0, (l.stockQuantity ?? 0) + delta) }
            : l,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update stock');
      throw err;
    }
  };

  const markAsSold = (id: string) => updateListing(id, { status: 'sold' });
  const markAsReserved = (id: string) => updateListing(id, { status: 'reserved' });
  const reactivateListing = (id: string) => updateListing(id, { status: 'active' });

  const getUserListings = (userId: string) =>
    listings.filter(l => l.sellerId === userId);
  const getSavedListings = (userId: string) =>
    listings.filter(l => l.savedBy.includes(userId));

  return {
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
    updateStock,
    markAsSold,
    markAsReserved,
    reactivateListing,
    getUserListings,
    getSavedListings,
  };
};
