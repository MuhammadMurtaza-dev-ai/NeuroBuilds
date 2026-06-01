import type { Listing } from '../../hooks/useStorage';

interface Props {
  listing: Listing;
  savedByCurrentUser: boolean;
  onClick: () => void;
  onSave: (e: React.MouseEvent) => void;
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

function formatRelativeDate(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ListingCard({ listing, savedByCurrentUser, onClick, onSave }: Props) {
  const isOutOfStock = listing.status === 'active' && (listing.stockQuantity ?? -1) === 0;

  return (
    <div
      onClick={onClick}
      className="glass-panel rounded-[2rem] border border-white/5 hover:border-primary/50 transition-all group flex flex-col cursor-pointer relative overflow-hidden"
    >
      {/* Save button */}
      <button
        onClick={onSave}
        aria-label={savedByCurrentUser ? 'Remove from saved' : 'Save listing'}
        className="absolute top-4 right-4 z-10 p-2 glass-panel rounded-full border border-white/10 hover:border-primary/50 transition-all backdrop-blur-sm"
      >
        <span
          className={`material-symbols-outlined text-lg leading-none ${savedByCurrentUser ? 'text-red-400' : 'text-gray-400 group-hover:text-white'}`}
          style={{ fontVariationSettings: savedByCurrentUser ? "'FILL' 1" : "'FILL' 0" }}
        >
          favorite
        </span>
      </button>

      {/* Image */}
      <div className="aspect-[4/3] bg-black/50 overflow-hidden relative">
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
            <span className={`px-4 py-2 rounded-full font-bold text-sm tracking-wider ${listing.status === 'sold' ? 'bg-red-500/80 text-white' : 'bg-yellow-500/80 text-black'}`}>
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

        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-xs font-medium bg-black/60 text-gray-300 border border-white/10 backdrop-blur-sm flex items-center gap-1 capitalize">
          <span className="material-symbols-outlined text-sm leading-none">{LISTING_TYPE_ICONS[listing.listingType]}</span>
          {listing.listingType}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2.5 flex-grow">
        <h4 className="font-bold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {listing.title}
        </h4>

        <div className="flex items-baseline gap-2">
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

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-base leading-none">location_on</span>
            {listing.location}
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <span className="material-symbols-outlined text-base leading-none">visibility</span>
            {listing.views}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-600 border-t border-white/5 pt-2.5 mt-auto">
          <span className="material-symbols-outlined text-base leading-none">account_circle</span>
          <span className="truncate">{listing.sellerName}</span>
          <span className="ml-auto shrink-0">{formatRelativeDate(listing.postedDate)}</span>
        </div>
      </div>
    </div>
  );
}
