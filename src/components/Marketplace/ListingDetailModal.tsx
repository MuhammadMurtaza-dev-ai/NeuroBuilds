import { useState, useEffect } from 'react';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../Firebase';
import type { Listing } from '../../hooks/useStorage';
import { useChatContext } from '../../context/ChatContext';
import VideoReviewCarousel from './VideoReviewCarousel';
import { fetchComponentReviews, type VideoItem } from '../../services/youtubeService';

interface Props {
  listing: Listing;
  savedByCurrentUser: boolean;
  isLoggedIn: boolean;
  onClose: () => void;
  onSave: () => void;
  currentUserId?: string;
  onDelete?: () => void;
  onEdit?: () => void;
}

const CONDITION_COLORS: Record<Listing['condition'], string> = {
  new: 'bg-green-500/20 text-green-400 border-green-500/30',
  used: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  refurbished: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

function formatRelativeDate(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ListingDetailModal({ listing, savedByCurrentUser, isLoggedIn, onClose, onSave, currentUserId, onDelete, onEdit }: Props) {
  const [activeImage, setActiveImage] = useState(0);
  const [contactRevealed, setContactRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contactingseller, setContactingSeller] = useState(false);
  const [reviewVideos, setReviewVideos] = useState<VideoItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const { startOrGetConversation, openChatWithConversation } = useChatContext();

  useEffect(() => {
    const isOwnerView = !!currentUserId && currentUserId === listing.sellerId;
    const sessionKey = `nb_viewed_${listing.id}`;
    if (isOwnerView || sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    updateDoc(doc(db, 'listings', listing.id), { views: increment(1) }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setReviewsLoading(true);
    setReviewVideos([]);
    fetchComponentReviews(listing.title).then(videos => {
      if (!cancelled) {
        setReviewVideos(videos);
        setReviewsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setReviewsLoading(false);
    });
    return () => { cancelled = true; };
  }, [listing.title]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/marketplace#${listing.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const handleContactSeller = async () => {
    if (!isLoggedIn) return;
    setContactingSeller(true);
    try {
      const conversationId = await startOrGetConversation(
        listing.sellerId,
        listing.id,
        listing.title,
        listing.images[0] ?? ''
      );
      openChatWithConversation(conversationId);
      onClose();
    } finally {
      setContactingSeller(false);
    }
  };

  const isOwner = !!currentUserId && currentUserId === listing.sellerId;
  const isOutOfStock = typeof listing.stockQuantity === 'number' && listing.stockQuantity === 0;

  const handleDelete = () => {
    if (!window.confirm('Permanently delete this listing? This cannot be undone.')) return;
    onDelete?.();
  };

  const specEntries = Object.entries(listing.specs ?? {});

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="glass-panel rounded-[2rem] border border-white/10 shadow-neon w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 sticky top-0 bg-bg-panel/90 backdrop-blur-md z-10 rounded-t-[2rem]">
          <h2 className="font-bold text-xl">Listing Details</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Images */}
          <div className="flex flex-col gap-3">
            <div className="aspect-[4/3] rounded-[1.5rem] bg-black/50 overflow-hidden">
              {listing.images.length > 0 ? (
                <img src={listing.images[activeImage]} alt={listing.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-6xl text-gray-700">image</span>
                </div>
              )}
            </div>
            {listing.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {listing.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`shrink-0 w-20 h-16 rounded-xl overflow-hidden border-2 transition-colors ${i === activeImage ? 'border-primary' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-5">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border capitalize ${CONDITION_COLORS[listing.condition]}`}>
                {listing.condition}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-gray-300 border border-white/10 capitalize">
                {listing.listingType}
              </span>
              {listing.status !== 'active' && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${listing.status === 'sold' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                  {listing.status}
                </span>
              )}
            </div>

            {/* Title & Price */}
            <div>
              <h1 className="text-2xl font-bold leading-tight mb-3">{listing.title}</h1>
              {listing.listingType === 'exchange' ? (
                <span className="text-accent-purple font-bold text-2xl">Exchange Only</span>
              ) : (
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-white font-mono text-3xl font-bold">Rs. {listing.price.toLocaleString('en-US')}</span>
                  {listing.negotiable && <span className="text-primary text-sm font-medium">• Negotiable</span>}
                </div>
              )}
              {listing.listingType === 'sell' && typeof listing.stockQuantity === 'number' && (
                <p className={`text-xs font-mono mt-1 ${isOutOfStock ? 'text-amber-400' : 'text-primary'}`}>
                  {isOutOfStock ? 'Out of stock' : `${listing.stockQuantity} available`}
                </p>
              )}
            </div>

            {/* Meta */}
            <div className="flex flex-col gap-2 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary leading-none">location_on</span>
                {listing.location}
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary leading-none">visibility</span>
                {listing.views} views
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary leading-none">schedule</span>
                Posted {formatRelativeDate(listing.postedDate)}
              </div>
            </div>

            {/* Tags */}
            {listing.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {listing.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={onSave}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-sm font-medium ${savedByCurrentUser ? 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'border-white/10 bg-white/5 text-gray-300 hover:border-primary/50 hover:text-white'}`}
              >
                <span
                  className="material-symbols-outlined text-lg leading-none"
                  style={{ fontVariationSettings: savedByCurrentUser ? "'FILL' 1" : "'FILL' 0" }}
                >
                  favorite
                </span>
                {savedByCurrentUser ? 'Saved' : 'Save'}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-gray-300 hover:border-primary/50 hover:text-white transition-all text-sm font-medium"
              >
                <span className="material-symbols-outlined text-lg leading-none">
                  {copied ? 'check' : 'share'}
                </span>
                {copied ? 'Copied!' : 'Share'}
              </button>
              {isOwner && (
                <>
                  <button
                    onClick={onEdit}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all text-sm font-medium"
                  >
                    <span className="material-symbols-outlined text-lg leading-none">edit</span>
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium"
                  >
                    <span className="material-symbols-outlined text-lg leading-none">delete</span>
                    Delete
                  </button>
                </>
              )}
            </div>

            {/* Seller / CTA — swapped for OUT OF STOCK banner when qty = 0 */}
            {isOutOfStock ? (
              <div className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-400">
                <span className="material-symbols-outlined text-[22px] shrink-0">inventory_2</span>
                <div>
                  <p className="font-bold text-sm">OUT OF STOCK</p>
                  <p className="text-xs opacity-70 mt-0.5">This item is currently unavailable</p>
                </div>
              </div>
            ) : (
              <>
                <div className="glass-panel rounded-xl p-4 border border-white/10">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm text-gray-400 uppercase tracking-wider">
                    <span className="material-symbols-outlined text-primary leading-none">account_circle</span>
                    Seller
                  </h3>
                  <p className="font-bold text-base">{listing.sellerName}</p>
                  {contactRevealed ? (
                    <p className="text-primary text-sm mt-1 font-mono">{listing.sellerContact}</p>
                  ) : (
                    <button
                      onClick={() => isLoggedIn && setContactRevealed(true)}
                      disabled={!isLoggedIn}
                      className={`mt-3 w-full text-sm px-4 py-2.5 rounded-xl transition-all font-bold ${isLoggedIn ? 'bg-primary text-bg-dark hover:bg-cyan-300 shadow-[0_0_12px_rgba(13,242,242,0.3)]' : 'bg-white/5 text-gray-500 cursor-not-allowed'}`}
                    >
                      {isLoggedIn ? 'Reveal Contact Info' : 'Sign in to Contact Seller'}
                    </button>
                  )}
                </div>

                {!isOwner && (
                  <button
                    onClick={handleContactSeller}
                    disabled={!isLoggedIn || contactingseller}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                      isLoggedIn
                        ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40 hover:bg-accent-purple/30 shadow-[0_0_12px_rgba(191,0,255,0.15)]'
                        : 'bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    {contactingseller ? (
                      <span className="material-symbols-outlined text-[18px] leading-none animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px] leading-none">chat</span>
                    )}
                    {isLoggedIn ? 'Message Seller' : 'Sign in to Message Seller'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Description & Specs */}
        <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-white/5 pt-6">
          <div>
            <h3 className="font-semibold mb-3 text-sm text-gray-400 uppercase tracking-wider">Description</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{listing.description}</p>
          </div>
          {specEntries.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 text-sm text-gray-400 uppercase tracking-wider">Specifications</h3>
              <div className="flex flex-col">
                {specEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm py-2.5 border-b border-white/5 last:border-0">
                    <span className="text-gray-500">{key}</span>
                    <span className="text-white font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Video Reviews */}
        <VideoReviewCarousel videos={reviewVideos} loading={reviewsLoading} />
      </div>
    </div>
  );
}
