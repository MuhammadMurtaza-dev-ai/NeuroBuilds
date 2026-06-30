import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import {
  Package,
  Bookmark,
  MessageSquare,
  Tag,
  TrendingUp,
  Clock,
  ChevronRight,
  Warehouse,
} from 'lucide-react';
import InventoryManager from './InventoryManager';
import AccountStatusBanner from './AccountStatusBanner';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../Firebase';
import GradientBackground from '../GradientBackground/GradientBackground';
import type { Listing } from '../../hooks/useStorage';
import type { Thread } from '../../hooks/useCommunity';
import { tsToISO } from '../../utils/firestore';
import { timeAgo } from '../../utils/datetime';

// ── Firestore doc converters (mirrors useMarketplace / useCommunity) ──────────

function docToListing(id: string, data: DocumentData): Listing {
  return {
    ...(data as Omit<Listing, 'id' | 'postedDate'>),
    id,
    postedDate: tsToISO(data.postedDate),
  };
}

function docToThread(id: string, data: DocumentData): Thread {
  return {
    id,
    title: data.title ?? '',
    body: data.body ?? '',
    authorId: data.authorId ?? '',
    authorName: data.authorName ?? '',
    country: data.country ?? '',
    category: data.category ?? '',
    upvoteCount: data.upvoteCount ?? 0,
    upvotedBy: data.upvotedBy ?? [],
    downvotedBy: data.downvotedBy ?? [],
    replyCount: data.replyCount ?? 0,
    createdAt: tsToISO(data.createdAt),
    linkedBlogId: data.linkedBlogId ?? undefined,
    linkedBlogTitle: data.linkedBlogTitle ?? undefined,
    status: data.status ?? 'active',
    lifecycleStatus: data.lifecycleStatus ?? 'open',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  sold: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  reserved: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

// ── Main component ────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [savedListings, setSavedListings] = useState<Listing[]>([]);
  const [myThreads, setMyThreads] = useState<Thread[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'inventory'>('overview');
  const [busyId, setBusyId] = useState<string | null>(null);

  const setListingStatus = async (id: string, status: Listing['status']) => {
    setBusyId(id);
    try {
      await updateDoc(doc(db, 'listings', id), { status });
    } finally {
      setBusyId(null);
    }
  };

  const removeListing = async (id: string) => {
    if (!window.confirm('Permanently delete this listing? This cannot be undone.')) return;
    setBusyId(id);
    try {
      await deleteDoc(doc(db, 'listings', id));
    } finally {
      setBusyId(null);
    }
  };

  // Tracks how many of the 3 onSnapshot listeners have fired at least once.
  // When all 3 fire, the skeleton loading state resolves.
  const pendingRef = useRef(3);

  useEffect(() => {
    if (!authLoading && !user) navigate('/');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;

    pendingRef.current = 3;
    setDataLoading(true);

    const uid = user.uid;

    const onFirstLoad = () => {
      pendingRef.current -= 1;
      if (pendingRef.current === 0) setDataLoading(false);
    };

    const unsubMyListings = onSnapshot(
      query(collection(db, 'listings'), where('sellerId', '==', uid)),
      (snap) => {
        setMyListings(
          snap.docs
            .map((d) => docToListing(d.id, d.data()))
            .sort(
              (a, b) =>
                new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime()
            )
        );
        onFirstLoad();
      }
    );

    const unsubSaved = onSnapshot(
      query(collection(db, 'listings'), where('savedBy', 'array-contains', uid)),
      (snap) => {
        setSavedListings(snap.docs.map((d) => docToListing(d.id, d.data())));
        onFirstLoad();
      }
    );

    const unsubThreads = onSnapshot(
      query(collection(db, 'threads'), where('authorId', '==', uid)),
      (snap) => {
        setMyThreads(
          snap.docs
            .map((d) => docToThread(d.id, d.data()))
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
        );
        onFirstLoad();
      }
    );

    return () => {
      unsubMyListings();
      unsubSaved();
      unsubThreads();
    };
  }, [user]);

  if (authLoading || !user) return null;

  // ── Derived stats ───────────────────────────────────────────────────────────
  const activeCount = myListings.filter((l) => l.status === 'active').length;
  const totalReplies = myThreads.reduce((sum, t) => sum + t.replyCount, 0);

  const stats = [
    {
      label: 'Active Listings',
      value: activeCount,
      sub: `${myListings.length} total`,
      borderColor: 'border-l-primary',
      textColor: 'text-primary',
      icon: <Package size={18} className="text-primary" />,
    },
    {
      label: 'Saved Items',
      value: savedListings.length,
      sub: 'in wishlist',
      borderColor: 'border-l-accent-purple',
      textColor: 'text-accent-purple',
      icon: <Bookmark size={18} className="text-accent-purple" />,
    },
    {
      label: 'Forum Posts',
      value: myThreads.length,
      sub: `${totalReplies} replies received`,
      borderColor: 'border-l-blue-400',
      textColor: 'text-blue-400',
      icon: <MessageSquare size={18} className="text-blue-400" />,
    },
  ];

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1440px] mx-auto w-full">
        <AccountStatusBanner uid={user.uid} displayName={user.displayName || user.email?.split('@')[0] || 'User'} />

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Welcome back,{' '}
            <span className="text-primary">
              {user.displayName || user.email?.split('@')[0] || 'Builder'}
            </span>
          </h1>
          <p className="text-gray-400 text-lg">
            Real-time activity across your marketplace listings, saved items, and forum posts.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {dataLoading
            ? [...Array(4)].map((_, i) => (
                <div key={i} className="glass-panel rounded-bento p-6 animate-pulse">
                  <div className="h-3 bg-white/10 rounded w-2/3 mb-4" />
                  <div className="h-10 bg-white/10 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              ))
            : stats.map((s) => (
                <div
                  key={s.label}
                  className={`glass-panel rounded-bento p-6 border-l-4 ${s.borderColor}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-sm uppercase tracking-wider">{s.label}</p>
                    {s.icon}
                  </div>
                  <p className="text-4xl font-bold text-white font-mono">
                    {s.value.toLocaleString()}
                  </p>
                  <p className={`text-xs font-mono mt-2 ${s.textColor}`}>{s.sub}</p>
                </div>
              ))}
        </div>

        {/* Tab bar — Inventory tab only visible when user has active listings */}
        {activeCount > 0 && (
          <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-4">
            {(['overview', 'inventory'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all border ${
                  activeTab === tab
                    ? 'bg-primary/10 text-primary border-primary/30 shadow-neon'
                    : 'text-gray-400 hover:text-white border-transparent'
                }`}
              >
                {tab === 'overview' ? (
                  <><Package size={14} /> Overview</>
                ) : (
                  <><Warehouse size={14} /> Inventory</>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Inventory manager tab */}
        {activeTab === 'inventory' && user && (
          <InventoryManager userId={user.uid} listings={myListings} />
        )}

        {/* 3-Column sub-lists */}
        {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* My Listings */}
          <SectionPanel
            title="My Listings"
            count={myListings.length}
            linkTo="/marketplace"
            loading={dataLoading}
            empty={
              <EmptyState
                icon={<Package size={30} className="text-gray-600" />}
                message="No listings yet"
                hint="Post your first item on the marketplace"
              />
            }
          >
            {myListings.map((l) => (
              <div
                key={l.id}
                className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0"
              >
                <div className="size-12 rounded-lg bg-white/5 shrink-0 overflow-hidden">
                  {l.images?.[0] ? (
                    <img
                      src={l.images[0]}
                      alt={l.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package size={16} className="text-gray-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{l.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-primary text-xs font-mono font-bold">
                      PKR {l.price.toLocaleString()}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        STATUS_COLORS[l.status] ?? STATUS_COLORS.active
                      }`}
                    >
                      {l.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-gray-500 text-xs">
                    <Tag size={10} />
                    <span>{l.category}</span>
                    <span>·</span>
                    <Clock size={10} />
                    <span>{timeAgo(l.postedDate)}</span>
                  </div>
                  {/* Management actions — listings stay visible in every status */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Link
                      to={`/marketplace?id=${l.id}`}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-primary/40 transition-all"
                    >
                      View
                    </Link>
                    {l.status === 'active' ? (
                      <button
                        onClick={() => setListingStatus(l.id, 'sold')}
                        disabled={busyId === l.id}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                      >
                        Mark Sold
                      </button>
                    ) : (
                      <button
                        onClick={() => setListingStatus(l.id, 'active')}
                        disabled={busyId === l.id}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50"
                      >
                        Reactivate
                      </button>
                    )}
                    <button
                      onClick={() => removeListing(l.id)}
                      disabled={busyId === l.id}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/5 border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-500/30 transition-all disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </SectionPanel>

          {/* Saved Items */}
          <SectionPanel
            title="Saved Items"
            count={savedListings.length}
            linkTo="/marketplace"
            loading={dataLoading}
            empty={
              <EmptyState
                icon={<Bookmark size={30} className="text-gray-600" />}
                message="No saved items"
                hint="Bookmark listings you're interested in buying"
              />
            }
          >
            {savedListings.map((l) => (
              <div
                key={l.id}
                className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0"
              >
                <div className="size-12 rounded-lg bg-white/5 shrink-0 overflow-hidden">
                  {l.images?.[0] ? (
                    <img
                      src={l.images[0]}
                      alt={l.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Bookmark size={16} className="text-gray-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{l.title}</p>
                  <p className="text-primary text-xs font-mono font-bold mt-1">
                    PKR {l.price.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-gray-500 text-xs">
                    <Tag size={10} />
                    <span>{l.category}</span>
                    <span>·</span>
                    <span
                      className={`capitalize px-1.5 py-0.5 rounded text-[10px] border ${
                        STATUS_COLORS[l.status] ?? STATUS_COLORS.active
                      }`}
                    >
                      {l.condition}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </SectionPanel>

          {/* Forum Posts */}
          <SectionPanel
            title="Forum Posts"
            count={myThreads.length}
            linkTo="/community"
            loading={dataLoading}
            empty={
              <EmptyState
                icon={<MessageSquare size={30} className="text-gray-600" />}
                message="No posts yet"
                hint="Start a discussion in the community"
              />
            }
          >
            {myThreads.map((t) => (
              <div key={t.id} className="py-3 border-b border-white/5 last:border-0">
                <p className="text-white text-sm font-medium line-clamp-2 mb-2">{t.title}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  <span className="px-2 py-0.5 bg-accent-purple/10 text-accent-purple border border-accent-purple/20 rounded-full text-[10px] font-bold capitalize">
                    {t.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp size={10} />
                    {t.upvoteCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare size={10} />
                    {t.replyCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {timeAgo(t.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </SectionPanel>
        </div>
        )}
      </main>
    </>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface SectionPanelProps {
  title: string;
  count: number;
  linkTo: string;
  loading: boolean;
  children: React.ReactNode;
  empty: React.ReactNode;
}

function SectionPanel({ title, count, linkTo, loading, children, empty }: SectionPanelProps) {
  return (
    <div className="glass-panel rounded-bento border border-white/10 flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-white text-sm">{title}</h2>
          {!loading && (
            <span className="px-2 py-0.5 bg-white/5 rounded-full text-xs font-mono text-gray-400">
              {count}
            </span>
          )}
        </div>
        <Link
          to={linkTo}
          className="flex items-center gap-1 text-xs text-primary hover:text-cyan-300 transition-colors font-mono"
        >
          View all <ChevronRight size={12} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[400px] px-5 py-1 scrollbar-thin scrollbar-thumb-white/10">
        {loading ? (
          <div className="space-y-3 py-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="size-12 rounded-lg bg-white/5 shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 bg-white/10 rounded w-4/5" />
                  <div className="h-3 bg-white/5 rounded w-2/5" />
                </div>
              </div>
            ))}
          </div>
        ) : count === 0 ? (
          empty
        ) : (
          children
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  message: string;
  hint: string;
}

function EmptyState({ icon, message, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {icon}
      <p className="text-white font-medium mt-3 mb-1 text-sm">{message}</p>
      <p className="text-gray-500 text-xs">{hint}</p>
    </div>
  );
}

export default Dashboard;
