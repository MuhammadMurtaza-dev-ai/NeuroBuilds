import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { Listing } from '../../hooks/useStorage';
import { formatRelativeDate } from '../../utils/datetime';

interface Props {
  listing: Listing;
  savedByCurrentUser: boolean;
  // Receive the listing back so the parent can pass *stable* (useCallback'd)
  // handlers — otherwise per-listing closures defeat React.memo on every render.
  onClick: (listing: Listing) => void;
  onSave: (e: React.MouseEvent, listing: Listing) => void;
}

const CONDITION_COLORS: Record<Listing['condition'], string> = {
  new: 'bg-green-500/20 text-green-400 border-green-500/30',
  used: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  refurbished: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const LISTING_TYPE_ICONS: Record<Listing['listingType'], string> = {
  sell: 'sell',
  buy: 'shopping_cart',
  exchange: 'swap_horiz',
};

function ListingCard({ listing, savedByCurrentUser, onClick, onSave }: Props) {
  const isOutOfStock = listing.status === 'active' && (listing.stockQuantity ?? -1) === 0;

  return (
    <div
      onClick={() => onClick(listing)}
      className="glass-panel rounded-[2rem] border border-border-glass hover:border-primary/50 transition-all group flex flex-col cursor-pointer relative overflow-hidden"
    >
      {/* Save button */}
      <button
        onClick={(e) => onSave(e, listing)}
        aria-label={savedByCurrentUser ? 'Remove from saved' : 'Save listing'}
        className="absolute top-3 right-3 z-10 size-11 flex items-center justify-center glass-panel rounded-full border border-black/10 dark:border-white/10 hover:border-primary/50 transition-all backdrop-blur-sm"
      >
        <span
          className={`material-symbols-outlined text-lg leading-none ${savedByCurrentUser ? 'text-red-400' : 'text-gray-400 group-hover:text-white'}`}
          style={{ fontVariationSettings: savedByCurrentUser ? "'FILL' 1" : "'FILL' 0" }}
        >
          favorite
        </span>
      </button>

      {/* Image */}
      <div className="aspect-[4/3] bg-bg-panel overflow-hidden relative">
        {listing.images[0] ? (
          <img
            src={listing.images[0]}
            alt={listing.title}
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${isOutOfStock ? 'saturate-50' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-5xl text-gray-700">image</span>
          </div>
        )}

        {listing.status !== 'active' && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className={`px-4 py-2 rounded-full font-bold text-sm tracking-wider ${
              listing.status === 'sold' ? 'bg-red-500/80 text-white' :
              listing.status === 'expired' ? 'bg-orange-500/80 text-white' :
              'bg-yellow-500/80 text-black'
            }`}>
              {listing.status.toUpperCase()}
            </span>
          </div>
        )}

        {isOutOfStock && (
          <div className="absolute top-3 right-11 z-10 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/90 text-black backdrop-blur-sm border border-amber-400/60">
            OUT OF STOCK
          </div>
        )}

        <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold border backdrop-blur-sm capitalize ${CONDITION_COLORS[listing.condition]}`}>
          {listing.condition}
        </div>

        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-xs font-medium bg-black/50 text-white border border-white/20 backdrop-blur-sm flex items-center gap-1 capitalize">
          <span className="material-symbols-outlined text-sm leading-none">{LISTING_TYPE_ICONS[listing.listingType]}</span>
          {listing.listingType}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2.5 flex-grow">
        <h4 className="font-bold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {listing.title}
        </h4>

        <div className="flex items-baseline gap-2 flex-wrap">
          {listing.listingType === 'exchange' ? (
            <span className="text-accent-purple font-bold text-lg">Exchange Only</span>
          ) : (
            <>
              <span className="text-white font-mono text-xl font-bold">Rs. {listing.price.toLocaleString('en-US')}</span>
              {listing.negotiable && (
                <span className="text-xs text-primary font-medium">Negotiable</span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1 min-w-0">
            <span className="material-symbols-outlined text-base leading-none">location_on</span>
            <span className="truncate">{listing.location}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 border-t border-border-glass pt-2.5 mt-auto">
          <span className="material-symbols-outlined text-base leading-none">account_circle</span>
          <Link
            to={`/seller/${listing.sellerId}`}
            onClick={e => e.stopPropagation()}
            className="truncate hover:text-primary transition-colors"
          >
            {listing.sellerName}
          </Link>
          <span className="ml-auto shrink-0">{formatRelativeDate(listing.postedDate)}</span>
        </div>
      </div>
    </div>
  );
}

// Memoized so a marketplace search keystroke only re-renders cards whose props
// actually change (handlers are stabilized with useCallback at the call site).
export default memo(ListingCard);
