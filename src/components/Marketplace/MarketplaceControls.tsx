import type { MarketplaceFilters } from '../../hooks/useMarketplace';

const CATEGORIES = [
  { name: 'All', icon: 'grid_view', id: 'all' },
  { name: 'Components', icon: 'memory', id: 'components' },
  { name: 'Laptops', icon: 'laptop_chromebook', id: 'laptops' },
  { name: 'Peripherals', icon: 'keyboard', id: 'peripherals' },
  { name: 'Consoles', icon: 'videogame_asset', id: 'consoles' },
  { name: 'Monitors', icon: 'monitor', id: 'monitors' },
];

interface Props {
  filters: MarketplaceFilters;
  setFilter: <K extends keyof MarketplaceFilters>(key: K, value: MarketplaceFilters[K]) => void;
  provinces: string[];
  cities: string[];
  areas: string[];
  onProvinceChange: (province: string) => void;
  onCityChange: (city: string) => void;
  hasActiveFilters: boolean;
  onClearAll: () => void;
}

/**
 * Vertical control rail for the marketplace "all" view.
 * Rendered as a sticky left sidebar on large screens and inside the
 * collapsible Filters panel on mobile — single source of truth for both.
 */
export default function MarketplaceControls({
  filters,
  setFilter,
  provinces,
  cities,
  areas,
  onProvinceChange,
  onCityChange,
  hasActiveFilters,
  onClearAll,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* Search */}
      <Section label="Search">
        <div className="flex items-center px-3.5 py-2.5 bg-bg-panel border border-border-glass rounded-pill group focus-within:border-primary/50 transition-colors">
          <span className="material-symbols-outlined text-gray-400 mr-2 group-focus-within:text-primary transition-colors shrink-0 text-base">search</span>
          <input
            type="text"
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            placeholder="GPUs, keyboards, monitors..."
            className="w-full bg-transparent border-none text-sm focus:ring-0 p-0 placeholder-[var(--text-muted)]"
          />
          {filters.search && (
            <button
              onClick={() => setFilter('search', '')}
              className="text-gray-500 hover:text-[var(--text-base)] transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-sm leading-none">close</span>
            </button>
          )}
        </div>
      </Section>

      {/* Location cascade */}
      <Section label="Location">
        <div className="flex flex-col gap-2">
          {/* Province */}
          <div className="flex items-center px-3.5 py-2.5 bg-bg-panel border border-border-glass rounded-pill focus-within:border-primary/50 transition-colors">
            <span className="material-symbols-outlined text-primary mr-2 shrink-0 text-sm">map</span>
            <select
              value={filters.province ?? ''}
              onChange={e => onProvinceChange(e.target.value)}
              className="bg-transparent border-none text-sm focus:ring-0 w-full cursor-pointer appearance-none p-0"
            >
              <option value="">All Provinces</option>
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="material-symbols-outlined text-gray-500 text-sm shrink-0">expand_more</span>
          </div>

          {/* City */}
          {cities.length > 0 && (
            <div className="flex items-center px-3.5 py-2.5 bg-bg-panel border border-border-glass rounded-pill focus-within:border-primary/50 transition-colors">
              <span className="material-symbols-outlined text-primary mr-2 shrink-0 text-sm">location_city</span>
              <select
                value={filters.location}
                onChange={e => onCityChange(e.target.value)}
                className="bg-transparent border-none text-sm focus:ring-0 w-full cursor-pointer appearance-none p-0"
              >
                <option value="All Locations">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="material-symbols-outlined text-gray-500 text-sm shrink-0">expand_more</span>
            </div>
          )}

          {/* Area */}
          {areas.length > 0 && (
            <div className="flex items-center px-3.5 py-2.5 bg-bg-panel border border-border-glass rounded-pill focus-within:border-primary/50 transition-colors">
              <span className="material-symbols-outlined text-primary mr-2 shrink-0 text-sm">pin_drop</span>
              <select
                value={filters.area ?? ''}
                onChange={e => setFilter('area', e.target.value)}
                className="bg-transparent border-none text-sm focus:ring-0 w-full cursor-pointer appearance-none p-0"
              >
                <option value="">All Areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <span className="material-symbols-outlined text-gray-500 text-sm shrink-0">expand_more</span>
            </div>
          )}
        </div>
      </Section>

      {/* Categories */}
      <Section label="Category">
        <div className="flex flex-col gap-1.5">
          {CATEGORIES.map(cat => {
            const active = filters.category === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setFilter('category', cat.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm transition-all group ${
                  active
                    ? 'bg-primary/10 border border-primary/40 text-white'
                    : 'border border-transparent text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--text-base)]'
                }`}
              >
                <span className={`material-symbols-outlined text-base leading-none ${active ? 'text-primary' : 'text-gray-500 group-hover:text-primary'} transition-colors`}>
                  {cat.icon}
                </span>
                <span className="font-medium">{cat.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Sort */}
      <Section label="Sort By">
        <div className="flex items-center px-3.5 py-2.5 bg-bg-panel border border-border-glass rounded-pill">
          <span className="material-symbols-outlined text-base text-gray-400 leading-none mr-2 shrink-0">sort</span>
          <select
            value={filters.sortBy}
            onChange={e => setFilter('sortBy', e.target.value as MarketplaceFilters['sortBy'])}
            className="bg-transparent border-none text-sm focus:ring-0 cursor-pointer appearance-none w-full p-0"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="most_viewed">Most Viewed</option>
          </select>
          <span className="material-symbols-outlined text-gray-500 text-sm shrink-0">expand_more</span>
        </div>
      </Section>

      {/* Listing type */}
      <Section label="Listing Type">
        <div className="grid grid-cols-2 gap-1.5">
          {(['all', 'sell', 'buy', 'exchange'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilter('listingType', type)}
              className={`px-3 py-2 rounded-xl text-sm capitalize transition-colors border ${
                filters.listingType === type
                  ? 'bg-primary text-bg-dark font-bold border-primary'
                  : 'border-border-glass text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {type === 'all' ? 'All Types' : type}
            </button>
          ))}
        </div>
      </Section>

      {/* Price range */}
      <Section label="Price Range (PKR)">
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={filters.priceMin ?? ''}
            onChange={e => setFilter('priceMin', e.target.value ? Number(e.target.value) : null)}
            placeholder="Min"
            min="0"
            className="w-full bg-bg-panel border border-border-glass rounded-xl px-3 py-2 text-sm placeholder-[var(--text-muted)] focus:border-primary/50 focus:outline-none"
          />
          <span className="text-[var(--text-muted)] shrink-0">—</span>
          <input
            type="number"
            value={filters.priceMax ?? ''}
            onChange={e => setFilter('priceMax', e.target.value ? Number(e.target.value) : null)}
            placeholder="Max"
            min="0"
            className="w-full bg-bg-panel border border-border-glass rounded-xl px-3 py-2 text-sm placeholder-[var(--text-muted)] focus:border-primary/50 focus:outline-none"
          />
        </div>
      </Section>

      {/* Condition */}
      <Section label="Condition">
        <div className="flex gap-2 flex-wrap">
          {(['new', 'used', 'refurbished'] as const).map(cond => {
            const active = filters.conditions.includes(cond);
            return (
              <button
                key={cond}
                onClick={() =>
                  setFilter(
                    'conditions',
                    active
                      ? filters.conditions.filter(c => c !== cond)
                      : [...filters.conditions, cond],
                  )
                }
                className={`px-3.5 py-2 rounded-xl text-sm capitalize transition-all ${active ? 'bg-primary text-bg-dark font-bold' : 'bg-black/5 dark:bg-white/5 text-[var(--text-muted)] hover:bg-black/10 dark:hover:bg-white/10'}`}
              >
                {cond}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Quick filters */}
      <Section label="Quick Filters">
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              className="accent-primary w-4 h-4"
              checked={filters.listingType === 'exchange'}
              onChange={e => setFilter('listingType', e.target.checked ? 'exchange' : 'all')}
            />
            <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-base)] transition-colors">Exchange only</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              className="accent-primary w-4 h-4"
              checked={filters.newOnly}
              onChange={e => setFilter('newOnly', e.target.checked)}
            />
            <span className="text-sm text-[var(--text-muted)] group-hover:text-[var(--text-base)] transition-colors">New listings (24h)</span>
          </label>
        </div>
      </Section>

      {hasActiveFilters && (
        <button
          onClick={onClearAll}
          className="text-sm text-gray-500 hover:text-white transition-colors underline self-start"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-2.5 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}
