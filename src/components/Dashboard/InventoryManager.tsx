import { Package } from 'lucide-react';
import { useMarketplace } from '../../hooks/useMarketplace';
import type { Listing } from '../../hooks/useStorage';

interface Props {
  userId: string;
  listings: Listing[];
}

export default function InventoryManager({ userId, listings }: Props) {
  const { updateStock } = useMarketplace();

  const inventoryListings = listings
    .filter((l) => l.sellerId === userId && l.status !== 'sold')
    .sort((a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime());

  if (inventoryListings.length === 0) {
    return (
      <div className="glass-panel rounded-bento border border-white/10 p-12 flex flex-col items-center text-center">
        <Package size={40} className="text-gray-600 mb-4" />
        <p className="text-white font-bold text-lg">No Active Inventory</p>
        <p className="text-gray-500 text-sm mt-1">
          Post a listing on the marketplace to start managing stock.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-bento border border-white/10 overflow-hidden">
      {/* Table header */}
      <div className="px-6 py-4 border-b border-white/10">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest font-mono flex items-center gap-2">
          <Package size={16} className="text-primary" />
          Inventory Ledger
          <span className="ml-1 text-primary font-mono">({inventoryListings.length})</span>
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] font-mono text-gray-500 uppercase tracking-wider border-b border-white/5">
              <th className="px-6 py-3">Item</th>
              <th className="px-6 py-3">SKU</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {inventoryListings.map((listing) => {
              const qty = listing.stockQuantity ?? 0;
              const isOutOfStock = qty === 0;

              return (
                <tr
                  key={listing.id}
                  className={`transition-all hover:bg-white/[2%] ${
                    isOutOfStock ? 'border-l-2 border-l-amber-500/60' : ''
                  }`}
                >
                  {/* Item */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-white/5 shrink-0 overflow-hidden border border-white/10">
                        {listing.images?.[0] ? (
                          <img
                            src={listing.images[0]}
                            alt={listing.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package size={14} className="text-gray-600" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate max-w-[200px]">
                          {listing.title}
                        </p>
                        <p className="text-xs font-mono text-primary mt-0.5">
                          PKR {listing.price.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* SKU */}
                  <td className="px-6 py-4">
                    <span className="text-xs font-mono text-gray-500">
                      {listing.sku || '—'}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border capitalize ${
                        listing.status === 'active'
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                      }`}
                    >
                      {listing.status}
                    </span>
                  </td>

                  {/* Stock control */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateStock(listing.id, -1)}
                        disabled={isOutOfStock}
                        className="size-7 rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:border-white/30 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Decrease stock"
                      >
                        <span className="material-symbols-outlined text-[14px]">remove</span>
                      </button>

                      <span
                        className={`min-w-[3ch] text-center text-sm font-bold font-mono ${
                          isOutOfStock ? 'text-amber-400' : 'text-white'
                        }`}
                      >
                        {qty}
                      </span>

                      <button
                        onClick={() => updateStock(listing.id, 1)}
                        className="size-7 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-neon transition-all flex items-center justify-center"
                        aria-label="Increase stock"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                      </button>

                      {isOutOfStock && (
                        <span className="ml-1 text-[10px] font-bold text-amber-400 font-mono bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                          OUT OF STOCK
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
