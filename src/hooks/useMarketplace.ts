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
import { tsToISO } from '../utils/firestore';

export interface MarketplaceFilters {
  category: string;
  search: string;
  /** Province filter. */
  province?: string;
  /** City-level filter — "All Locations" disables it. */
  location: string;
  /** Area/neighbourhood — when set, drives Tier-1 exact area search. */
  area?: string;
  conditions: string[];
  listingType: string;
  priceMin: number | null;
  priceMax: number | null;
  sortBy: 'newest' | 'oldest' | 'price_asc' | 'price_desc';
  newOnly: boolean;
}

export const DEFAULT_FILTERS: MarketplaceFilters = {
  category: 'all',
  search: '',
  province: '',
  location: 'All Locations',
  area: '',
  conditions: [],
  listingType: 'all',
  priceMin: null,
  priceMax: null,
  sortBy: 'newest',
  newOnly: false,
};

const LISTINGS_COLLECTION = 'listings';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const docToListing = (id: string, data: DocumentData): Listing => ({
  ...(data as Omit<Listing, 'id' | 'postedDate'>),
  id,
  postedDate: tsToISO(data.postedDate),
  expiresAt:
    data.expiresAt instanceof Timestamp
      ? data.expiresAt.toDate().toISOString()
      : typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
  lastActivatedAt:
    data.lastActivatedAt instanceof Timestamp
      ? data.lastActivatedAt.toDate().toISOString()
      : typeof data.lastActivatedAt === 'string' ? data.lastActivatedAt : undefined,
});

export const useMarketplace = () => {
  const { selectedCountry } = useCountry();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<number>(0);
  const [tierLabel, setTierLabel] = useState('');

  /**
   * Firestore-native cascading location search:
   * Tier 1 — exact area match.
   * Tier 2 — same city (falls back when area returns nothing).
   * Tier 3 — country-wide (no city selected).
   */
  const fetchByLocation = useCallback(async (opts: {
    area?: string;
    city?: string;
    province?: string;
  }) => {
    setLoading(true);
    setError(null);
    setListings([]);

    const { area, city } = opts;

    try {
      // Tier 1: exact area
      if (area) {
        const q1 = query(
          collection(db, LISTINGS_COLLECTION),
          where('country', '==', selectedCountry),
          where('area', '==', area),
          where('status', '==', 'active'),
          orderBy('postedDate', 'desc'),
          limit(50),
        );
        const snap1 = await getDocs(q1);
        if (!snap1.empty) {
          setListings(snap1.docs.map(d => docToListing(d.id, d.data())));
          setTier(1);
          setTierLabel(area);
          return;
        }

        // Tier 1 miss — fall back to city or do legacy substring fallback
        if (city) {
          const q2 = query(
            collection(db, LISTINGS_COLLECTION),
            where('country', '==', selectedCountry),
            where('city', '==', city),
            where('status', '==', 'active'),
            orderBy('postedDate', 'desc'),
            limit(50),
          );
          const snap2 = await getDocs(q2);

          // Also include legacy docs (no city field) via substring match
          const fromCity = snap2.docs.map(d => docToListing(d.id, d.data()));
          if (fromCity.length === 0) {
            // Further legacy fallback: country-scoped + substring
            const legacySnap = await getDocs(query(
              collection(db, LISTINGS_COLLECTION),
              where('country', '==', selectedCountry),
              where('status', '==', 'active'),
              orderBy('postedDate', 'desc'),
              limit(100),
            ));
            const lc = city.toLowerCase();
            const legacy = legacySnap.docs
              .map(d => docToListing(d.id, d.data()))
              .filter(l => !l.city && l.location.toLowerCase().includes(lc));
            setListings(legacy);
          } else {
            setListings(fromCity);
          }
          setTier(2);
          setTierLabel(`All of ${city}`);
          return;
        }
      }

      // Tier 2 entry: city selected, no area
      if (city) {
        const q2 = query(
          collection(db, LISTINGS_COLLECTION),
          where('country', '==', selectedCountry),
          where('city', '==', city),
          where('status', '==', 'active'),
          orderBy('postedDate', 'desc'),
          limit(50),
        );
        const snap2 = await getDocs(q2);
        const fromCity = snap2.docs.map(d => docToListing(d.id, d.data()));

        // Legacy docs: substring on the denormalized location string
        const legacySnap = await getDocs(query(
          collection(db, LISTINGS_COLLECTION),
          where('country', '==', selectedCountry),
          where('status', '==', 'active'),
          orderBy('postedDate', 'desc'),
          limit(100),
        ));
        const lc = city.toLowerCase();
        const legacy = legacySnap.docs
          .map(d => docToListing(d.id, d.data()))
          .filter(l => !l.city && l.location.toLowerCase().includes(lc));

        // Merge, deduplicate by id
        const seen = new Set(fromCity.map(l => l.id));
        const merged = [...fromCity, ...legacy.filter(l => !seen.has(l.id))];
        setListings(merged);
        setTier(2);
        setTierLabel(merged.length > 0 ? city : `All of ${selectedCountry}`);
        return;
      }

      // Tier 3: country-wide
      await fetchByScope();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings');
      setLoading(false);
    }
  }, [selectedCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Country-scoped Firestore fetch — used when no location filters are active.
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
        where('status', '==', 'active'),
        orderBy('postedDate', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      let mapped = snap.docs.map(d => docToListing(d.id, d.data()));
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

  /** Fetch all listings belonging to a specific seller (all statuses). */
  const fetchMine = useCallback(async (uid: string) => {
    setLoading(true);
    setError(null);
    setListings([]);
    setTier(0);
    setTierLabel('');
    try {
      const q = query(
        collection(db, LISTINGS_COLLECTION),
        where('sellerId', '==', uid),
        orderBy('postedDate', 'desc'),
      );
      const snap = await getDocs(q);
      setListings(snap.docs.map(d => docToListing(d.id, d.data())));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your listings');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Fetch all listings saved by a specific user. */
  const fetchSaved = useCallback(async (uid: string) => {
    setLoading(true);
    setError(null);
    setListings([]);
    setTier(0);
    setTierLabel('');
    try {
      const q = query(
        collection(db, LISTINGS_COLLECTION),
        where('savedBy', 'array-contains', uid),
        orderBy('postedDate', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      setListings(snap.docs.map(d => docToListing(d.id, d.data())));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved listings');
    } finally {
      setLoading(false);
    }
  }, []);

  const createListing = async (
    listing: Omit<Listing, 'id' | 'savedBy' | 'postedDate'>,
  ): Promise<Listing> => {
    try {
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + THIRTY_DAYS_MS);
      const docRef = await addDoc(collection(db, LISTINGS_COLLECTION), {
        ...listing,
        country: listing.country || selectedCountry,
        savedBy: [],
        postedDate: now,
        expiresAt,
        lastActivatedAt: now,
      });
      const newListing: Listing = {
        ...listing,
        country: listing.country || selectedCountry,
        id: docRef.id,
        savedBy: [],
        postedDate: now.toDate().toISOString(),
        expiresAt: expiresAt.toDate().toISOString(),
        lastActivatedAt: now.toDate().toISOString(),
      };
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
      if (updates.expiresAt) {
        firestoreUpdates.expiresAt = Timestamp.fromDate(new Date(updates.expiresAt));
      }
      if (updates.lastActivatedAt) {
        firestoreUpdates.lastActivatedAt = Timestamp.fromDate(new Date(updates.lastActivatedAt));
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

  const reactivateListing = (id: string) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS);
    return updateListing(id, {
      status: 'active',
      lastActivatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  };

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
    fetchByLocation,
    fetchByScope,
    fetchMine,
    fetchSaved,
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
