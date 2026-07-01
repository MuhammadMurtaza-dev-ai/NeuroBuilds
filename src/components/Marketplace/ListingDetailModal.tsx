import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../../Firebase';
import type { Listing } from '../../hooks/useStorage';
import { useChatContext } from '../../context/ChatContext';
import { writeNotification } from '../../hooks/useNotifications';
import { writeAuditLog } from '../../utils/auditLog';
import VideoReviewCarousel from './VideoReviewCarousel';
import ReportModal from './ReportModal';
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

interface ContactReveal {
  viewerId: string;
  viewerName: string;
  revealedAt: Timestamp | null;
}

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [contactRevealed, setContactRevealed] = useState(false);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reveals, setReveals] = useState<ContactReveal[]>([]);
  const [reviewVideos, setReviewVideos] = useState<VideoItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const { sendListingMessage } = useChatContext();

  const isOwner = !!currentUserId && currentUserId === listing.sellerId;
  const isOutOfStock = typeof listing.stockQuantity === 'number' && listing.stockQuantity === 0;

  // Component review videos.
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

  // Owner-only: live list of who revealed their contact info.
  useEffect(() => {
    if (!isOwner) return;
    const q = query(
      collection(db, 'listings', listing.id, 'contactReveals'),
      orderBy('revealedAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      snap => setReveals(snap.docs.map(d => {
        const data = d.data();
        return {
          viewerId: data.viewerId ?? d.id,
          viewerName: data.viewerName ?? 'A user',
          revealedAt: data.revealedAt instanceof Timestamp ? data.revealedAt : null,
        };
      })),
      () => setReveals([]),
    );
    return unsub;
  }, [isOwner, listing.id]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const shareUrl = `${window.location.origin}/marketplace?id=${listing.id}`;
  const shareMessage = 'Check this listing out on NeuroBuilds Marketplace.';

  const handleShareClick = async () => {
    // Native share sheet on supported (mostly mobile) browsers.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: listing.title, text: shareMessage, url: shareUrl });
        return;
      } catch {
        // user cancelled or unsupported — fall through to the menu
      }
    }
    setShareOpen(v => !v);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareMessage} ${shareUrl}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const handleRevealContact = async () => {
    if (!isLoggedIn) return;
    const viewer = auth.currentUser;
    if (!viewer || isOwner) return;

    // Fetch the live authoritative verified phone from the seller's Firestore profile.
    // This cannot be spoofed (phoneNumber is server-set via the OTP endpoint).
    try {
      const sellerSnap = await getDoc(doc(db, 'users', listing.sellerId));
      const livePhone = sellerSnap.data()?.phoneNumber as string | undefined;
      setRevealedPhone(livePhone ?? listing.sellerPhone ?? null);
    } catch {
      setRevealedPhone(listing.sellerPhone ?? null);
    }

    setContactRevealed(true);

    // Record who revealed the contact so the seller can see it.
    setDoc(
      doc(db, 'listings', listing.id, 'contactReveals', viewer.uid),
      {
        viewerId: viewer.uid,
        viewerName: viewer.displayName ?? 'A user',
        revealedAt: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => {});
    writeNotification(listing.sellerId, {
      type: 'marketplace_message',
      title: 'Someone viewed your contact info',
      body: `${viewer.displayName ?? 'A user'} revealed your contact details on "${listing.title}".`,
      linkUrl: `/marketplace?id=${listing.id}`,
    }).catch(() => {});
    writeAuditLog(viewer.uid, 'listing.contact_reveal', {
      targetId: listing.id,
      targetType: 'listing',
    });
  };

  const handleSendMessage = async () => {
    if (!isLoggedIn || sendingMessage) return;
    setSendingMessage(true);
    try {
      await sendListingMessage(
        listing.sellerId,
        { id: listing.id, title: listing.title, image: listing.images[0] ?? '' },
        messageText,
      );
      setMessageText('');
      onClose();
    } finally {
      setSendingMessage(false);
    }
  };

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
      <div className="glass-panel rounded-[2rem] border border-black/10 dark:border-white/10 shadow-neon w-full max-w-[calc(100vw-1.5rem)] lg:max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border-glass sticky top-0 bg-bg-panel/90 backdrop-blur-md z-10 rounded-t-[2rem]">
          <h2 className="font-bold text-xl">Listing Details</h2>
          <button onClick={onClose} className="size-10 flex items-center justify-center rounded-full hover:bg-black/8 dark:hover:bg-white/10 transition-colors" aria-label="Close listing details">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Images */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => listing.images.length > 0 && setLightboxOpen(true)}
              className="aspect-[4/3] rounded-[1.5rem] bg-bg-panel overflow-hidden relative group/img cursor-zoom-in"
              aria-label="View full-size image"
            >
              {listing.images.length > 0 ? (
                <>
                  <img src={listing.images[activeImage]} alt={listing.title} className="w-full h-full object-cover" />
                  <div className="absolute bottom-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-medium opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm">
                    <span className="material-symbols-outlined text-sm leading-none">fullscreen</span>
                    View full size
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-6xl text-gray-700">image</span>
                </div>
              )}
            </button>
            {listing.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth mask-gradient">
                {listing.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`snap-start shrink-0 w-20 h-16 rounded-xl overflow-hidden border-2 transition-colors ${i === activeImage ? 'border-primary' : 'border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30'}`}
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
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 capitalize">
                {listing.listingType}
              </span>
              {listing.status !== 'active' && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize border ${
                  listing.status === 'sold' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                  listing.status === 'expired' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                }`}>
                  {listing.status}
                </span>
              )}
            </div>

            {/* Title & Price */}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight mb-3">{listing.title}</h1>
              {listing.listingType === 'exchange' ? (
                <span className="text-accent-purple font-bold text-2xl">Exchange Only</span>
              ) : (
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-white font-mono text-3xl font-bold">Rs. {listing.price.toLocaleString('en-US')}</span>
                  {listing.negotiable && <span className="text-primary text-sm font-medium">Negotiable</span>}
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
                <span className="material-symbols-outlined text-lg text-primary leading-none">schedule</span>
                Posted {formatRelativeDate(listing.postedDate)}
              </div>
            </div>

            {/* Tags */}
            {listing.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {listing.tags.map(tag => {
                  const clean = tag.replace(/^#/, '');
                  return (
                    <a
                      key={tag}
                      href={`/marketplace?tag=${encodeURIComponent(clean)}`}
                      className="px-3 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                    >
                      #{clean}
                    </a>
                  );
                })}
              </div>
            )}

            {/* Primary actions */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={onSave}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-sm font-medium ${savedByCurrentUser ? 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:border-primary/50'}`}
              >
                <span
                  className="material-symbols-outlined text-lg leading-none"
                  style={{ fontVariationSettings: savedByCurrentUser ? "'FILL' 1" : "'FILL' 0" }}
                >
                  favorite
                </span>
                {savedByCurrentUser ? 'Saved' : 'Save'}
              </button>

              {/* Share */}
              <div className="relative">
                <button
                  onClick={handleShareClick}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:border-primary/50 transition-all text-sm font-medium"
                >
                  <span className="material-symbols-outlined text-lg leading-none">share</span>
                  Share
                </button>
                {shareOpen && (
                  <div className="absolute right-0 mt-2 z-20 w-[min(14rem,calc(100vw-3rem))] sm:w-60 glass-panel rounded-2xl border border-white/10 shadow-neon p-2 flex flex-col">
                    <button
                      onClick={copyShareLink}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-sm text-left"
                    >
                      <span className="material-symbols-outlined text-lg leading-none text-primary">
                        {shareCopied ? 'check' : 'link'}
                      </span>
                      {shareCopied ? 'Copied!' : 'Copy link'}
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`${shareMessage} ${shareUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-sm"
                    >
                      <span className="material-symbols-outlined text-lg leading-none text-green-400">chat</span>
                      Share via WhatsApp
                    </a>
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}&url=${encodeURIComponent(shareUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-sm"
                    >
                      <span className="material-symbols-outlined text-lg leading-none text-sky-400">share</span>
                      Share on X
                    </a>
                  </div>
                )}
              </div>

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

            {/* Seller sidebar / CTA — swapped for OUT OF STOCK banner when qty = 0 */}
            {isOutOfStock ? (
              <div className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-400">
                <span className="material-symbols-outlined text-[22px] shrink-0">inventory_2</span>
                <div>
                  <p className="font-bold text-sm">OUT OF STOCK</p>
                  <p className="text-xs opacity-70 mt-0.5">This item is currently unavailable</p>
                </div>
              </div>
            ) : (
              <div className="glass-panel rounded-2xl p-5 border border-black/10 dark:border-white/10 flex flex-col gap-4 bg-black/5 dark:bg-white/[0.03]">
                {/* Seller identity */}
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary leading-none">account_circle</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-mono">Seller</p>
                    <Link
                      to={`/seller/${listing.sellerId}`}
                      onClick={e => e.stopPropagation()}
                      className="font-bold text-base truncate hover:text-primary transition-colors block"
                    >
                      {listing.sellerName}
                    </Link>
                  </div>
                </div>

                {/* Verified WhatsApp phone reveal — never shows email */}
                <div>
                  {contactRevealed ? (
                    revealedPhone ? (
                      <>
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/10 border border-primary/30">
                          <span className="material-symbols-outlined text-primary text-lg leading-none">call</span>
                          <span className="text-primary text-sm font-mono break-all">{revealedPhone}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs leading-none text-emerald-400">verified</span>
                          Verified via WhatsApp. Seller notified.
                        </p>
                      </>
                    ) : (
                      <div className="px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-gray-400 text-sm text-center">
                        <p>No phone number shared.</p>
                        <p className="text-xs text-gray-500 mt-1">Use the message composer below to contact the seller.</p>
                      </div>
                    )
                  ) : (
                    <button
                      onClick={handleRevealContact}
                      disabled={!isLoggedIn || isOwner}
                      className={`w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-xl transition-all font-bold ${isLoggedIn && !isOwner ? 'bg-primary text-bg-dark hover:bg-cyan-300 shadow-[0_0_12px_rgba(13,242,242,0.3)]' : 'bg-black/5 dark:bg-white/5 text-gray-500 cursor-not-allowed'}`}
                    >
                      <span className="material-symbols-outlined text-lg leading-none">phone_iphone</span>
                      {isOwner ? 'Your listing' : isLoggedIn ? 'Reveal Contact Info' : 'Sign in to Contact Seller'}
                    </button>
                  )}
                </div>

                {/* Message composer (buyers only) */}
                {!isOwner && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] text-gray-500 uppercase tracking-wider font-mono">Message Seller</label>
                    <textarea
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      disabled={!isLoggedIn}
                      rows={2}
                      placeholder={isLoggedIn ? 'Is this still available?' : 'Sign in to message the seller'}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none resize-none disabled:opacity-50"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!isLoggedIn || sendingMessage}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        isLoggedIn
                          ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40 hover:bg-accent-purple/30 shadow-[0_0_12px_rgba(191,0,255,0.15)]'
                          : 'bg-black/5 dark:bg-white/5 text-gray-500 border border-black/10 dark:border-white/10 cursor-not-allowed'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {sendingMessage ? (
                        <span className="material-symbols-outlined text-[18px] leading-none animate-spin">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-[18px] leading-none">send</span>
                      )}
                      {isLoggedIn ? 'Send & Attach Listing' : 'Sign in to Message Seller'}
                    </button>
                  </div>
                )}

                {/* Owner: who revealed my contact */}
                {isOwner && reveals.length > 0 && (
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-mono mb-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm leading-none">visibility</span>
                      Contact viewed by ({reveals.length})
                    </p>
                    <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                      {reveals.map(r => (
                        <div key={r.viewerId} className="flex items-center justify-between text-xs">
                          <span className="text-gray-300 truncate">{r.viewerName}</span>
                          <span className="text-gray-600 font-mono shrink-0 ml-2">
                            {r.revealedAt ? formatRelativeDate(r.revealedAt.toDate().toISOString()) : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Report */}
                {!isOwner && isLoggedIn && (
                  <button
                    onClick={() => setShowReport(true)}
                    className="min-h-11 flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors pt-1"
                  >
                    <span className="material-symbols-outlined text-base leading-none">flag</span>
                    Report this listing or seller
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Description & Specs */}
        <div className="px-4 sm:px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-border-glass pt-6">
          <div>
            <h3 className="font-semibold mb-3 text-sm text-gray-400 uppercase tracking-wider">Description</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{listing.description}</p>
          </div>
          {specEntries.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 text-sm text-gray-400 uppercase tracking-wider">Specifications</h3>
              <div className="flex flex-col">
                {specEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3 text-sm py-2.5 border-b border-border-glass last:border-0">
                    <span className="text-gray-500 break-words">{key}</span>
                    <span className="text-white font-medium text-right break-words">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Video Reviews */}
        <VideoReviewCarousel videos={reviewVideos} loading={reviewsLoading} searchTerm={listing.title} />
      </div>

      {/* Full-size image lightbox */}
      {lightboxOpen && listing.images.length > 0 && (
        <ImageLightbox
          images={listing.images}
          index={activeImage}
          onIndex={setActiveImage}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Report modal */}
      {showReport && (
        <ReportModal
          listing={listing}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

// ── Full-size image lightbox ───────────────────────────────────────────────────

function ImageLightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % images.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onIndex, onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 size-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
        aria-label="Close full-size view"
      >
        <span className="material-symbols-outlined">close</span>
      </button>

      <img
        src={images[index]}
        alt=""
        className="max-w-full max-h-[90vh] object-contain"
        onClick={e => e.stopPropagation()}
      />

      {images.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); onIndex((index - 1 + images.length) % images.length); }}
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 size-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
            aria-label="Previous image"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onIndex((index + 1) % images.length); }}
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 size-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
            aria-label="Next image"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-mono">
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}
