import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../Firebase';
import { useAuth } from '../hooks/useAuth';
import type { Listing } from '../hooks/useStorage';
import ListingCard from '../components/Marketplace/ListingCard';
import ListingDetailModal from '../components/Marketplace/ListingDetailModal';
import GradientBackground from '../components/GradientBackground/GradientBackground';

interface SellerProfile {
  uid: string;
  displayName: string;
  username?: string;
  photoURL?: string;
  bio?: string;
  isVerified?: boolean;
  role?: string;
  createdAt?: string;
}

function docToListing(id: string, data: DocumentData): Listing {
  return {
    ...(data as Omit<Listing, 'id' | 'postedDate'>),
    id,
    postedDate:
      data.postedDate instanceof Timestamp
        ? data.postedDate.toDate().toISOString()
        : String(data.postedDate ?? ''),
  };
}

interface Props {
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export default function SellerProfilePage({ onOpenAuth }: Props) {
  const { uid } = useParams<{ uid: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingListings, setLoadingListings] = useState(true);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Require sign-in to view profiles (firestore.rules: users read requires isSignedIn())
  useEffect(() => {
    if (!user) {
      onOpenAuth('login');
    }
  }, [user, onOpenAuth]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guard-and-return pattern, not cascading
    if (!uid) { setNotFound(true); return; }

    setLoadingProfile(true);
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (!snap.exists()) {
        setNotFound(true);
        return;
      }
      const d = snap.data();
      setProfile({
        uid,
        displayName: d.displayName ?? d.email?.split('@')[0] ?? 'Unknown Seller',
        username: d.username,
        photoURL: d.photoURL,
        bio: d.bio,
        isVerified: d.isVerified === true,
        role: d.role,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate().toISOString() : undefined,
      });
    }).catch(() => setNotFound(true))
      .finally(() => setLoadingProfile(false));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading reset before async fetch
    setLoadingListings(true);
    getDocs(
      query(
        collection(db, 'listings'),
        where('sellerId', '==', uid),
        where('status', '==', 'active'),
        orderBy('postedDate', 'desc'),
      )
    ).then(snap => {
      setListings(snap.docs.map(d => docToListing(d.id, d.data())));
    }).catch(() => setListings([]))
      .finally(() => setLoadingListings(false));
  }, [uid]);

  if (notFound) {
    return (
      <>
        <GradientBackground />
        <main className="relative z-10 flex-grow pt-40 pb-20 px-4 flex flex-col items-center justify-center text-center">
          <span className="material-symbols-outlined text-6xl text-gray-700 mb-4">person_off</span>
          <h1 className="text-2xl font-bold mb-2">Seller not found</h1>
          <p className="text-gray-500 mb-6">This profile doesn't exist or has been removed.</p>
          <button
            onClick={() => navigate('/marketplace')}
            className="px-6 py-3 bg-primary text-bg-dark font-bold rounded-pill text-sm hover:bg-cyan-300 transition-all"
          >
            Browse Marketplace
          </button>
        </main>
      </>
    );
  }

  const isOwnProfile = user?.uid === uid;

  const initials = profile?.displayName
    ? profile.displayName.slice(0, 2).toUpperCase()
    : '??';

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto w-full">

        {/* Profile Header */}
        <div className="glass-panel rounded-[2rem] border border-white/10 p-8 mb-8 flex flex-col md:flex-row items-start gap-6">
          {loadingProfile ? (
            <div className="animate-pulse flex gap-6 w-full">
              <div className="w-24 h-24 rounded-full bg-white/10 shrink-0" />
              <div className="flex-1 space-y-3 pt-2">
                <div className="h-6 bg-white/10 rounded w-48" />
                <div className="h-4 bg-white/5 rounded w-32" />
                <div className="h-4 bg-white/5 rounded w-full max-w-sm" />
              </div>
            </div>
          ) : profile ? (
            <>
              {/* Avatar */}
              <div className="shrink-0">
                {profile.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile.displayName}
                    className="w-24 h-24 rounded-full object-cover border-2 border-primary/40"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-primary/15 border-2 border-primary/40 flex items-center justify-center">
                    <span className="text-primary text-3xl font-bold font-mono">{initials}</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold">{profile.displayName}</h1>
                  {profile.isVerified && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <span className="material-symbols-outlined text-sm leading-none">verified</span>
                      Verified Seller
                    </span>
                  )}
                  {profile.role && profile.role !== 'user' && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-accent-purple/15 text-accent-purple border border-accent-purple/30 capitalize">
                      {profile.role}
                    </span>
                  )}
                </div>

                {profile.username && (
                  <p className="text-gray-500 text-sm font-mono mb-3">@{profile.username}</p>
                )}

                {profile.bio ? (
                  <p className="text-gray-300 text-sm leading-relaxed max-w-2xl">{profile.bio}</p>
                ) : isOwnProfile ? (
                  <p className="text-gray-600 text-sm italic">
                    No bio yet.{' '}
                    <button
                      onClick={() => navigate('/profile')}
                      className="text-primary hover:underline"
                    >
                      Add one in your profile
                    </button>
                  </p>
                ) : (
                  <p className="text-gray-600 text-sm italic">This seller hasn't added a bio.</p>
                )}

                {profile.createdAt && (
                  <p className="text-gray-600 text-xs mt-3 font-mono">
                    Member since {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>

              {isOwnProfile && (
                <button
                  onClick={() => navigate('/profile')}
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-gray-300 hover:text-white hover:border-primary/40 transition-all"
                >
                  <span className="material-symbols-outlined text-base leading-none">edit</span>
                  Edit Profile
                </button>
              )}
            </>
          ) : null}
        </div>

        {/* Listings Section */}
        <div>
          <h2 className="text-xl font-bold mb-4">
            {isOwnProfile ? 'Your Active Listings' : `${profile?.displayName ?? 'Seller'}'s Listings`}
          </h2>

          {loadingListings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-panel rounded-[2rem] border border-border-glass overflow-hidden animate-pulse">
                  <div className="aspect-[4/3] bg-white/5" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-white/5 rounded w-3/4" />
                    <div className="h-5 bg-white/5 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : listings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {listings.map(l => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  savedByCurrentUser={false}
                  onClick={() => setSelectedListing(l)}
                  onSave={e => e.stopPropagation()}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center glass-panel rounded-[2rem] border border-white/10">
              <span className="material-symbols-outlined text-6xl text-gray-700 mb-4">store</span>
              <p className="text-gray-400 font-medium">No active listings</p>
              <p className="text-gray-600 text-sm mt-1">
                {isOwnProfile ? 'You don\'t have any active listings.' : 'This seller has no active listings right now.'}
              </p>
            </div>
          )}
        </div>
      </main>

      {selectedListing && (
        <ListingDetailModal
          listing={selectedListing}
          savedByCurrentUser={false}
          isLoggedIn={!!user}
          onClose={() => setSelectedListing(null)}
          onSave={() => {}}
          currentUserId={user?.uid}
        />
      )}
    </>
  );
}
