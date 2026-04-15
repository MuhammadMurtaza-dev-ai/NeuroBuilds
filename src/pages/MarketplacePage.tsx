import { useState } from 'react';
import { useStorage } from '../hooks/useStorage';
import GradientBackground from '../components/GradientBackground/GradientBackground';

export default function MarketplacePage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('All Locations');
  const { data } = useStorage();

  const categories = [
    { name: 'All Categories', icon: 'grid_view', id: 'all' },
    { name: 'Components', icon: 'memory', id: 'components' },
    { name: 'Laptops', icon: 'laptop_chromebook', id: 'laptops' },
    { name: 'Peripherals', icon: 'keyboard', id: 'peripherals' },
    { name: 'Consoles', icon: 'videogame_asset', id: 'consoles' },
    { name: 'Monitors', icon: 'monitor', id: 'monitors' },
  ];

  const products = data.products;

  const filteredProducts = products.filter((product) => {
    if (selectedCategory !== 'all' && product.category !== selectedCategory) return false;
    if (searchQuery && !product.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto w-full">
        {/* Search & Filter Bar */}
      <div className="glass-panel p-2 md:p-3 rounded-[2rem] border border-white/10 shadow-neon mb-10 mx-auto max-w-4xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent-purple/5 pointer-events-none"></div>
        <div className="flex flex-col md:flex-row gap-2 relative z-10">
          <div className="flex items-center px-4 py-3 bg-black/40 rounded-pill border border-white/5 md:w-1/3 group focus-within:border-primary/50 transition-colors">
            <span className="material-symbols-outlined text-primary mr-2">location_on</span>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="bg-transparent border-none text-white text-sm focus:ring-0 w-full cursor-pointer appearance-none p-0"
            >
              <option>All Locations</option>
              <option>New York, NY</option>
              <option>San Francisco, CA</option>
              <option>Austin, TX</option>
              <option>Remote</option>
            </select>
            <span className="material-symbols-outlined text-gray-500 text-sm">expand_more</span>
          </div>
          <div className="flex flex-grow items-center px-4 py-3 bg-black/40 rounded-pill border border-white/5 group focus-within:border-primary/50 transition-colors">
            <span className="material-symbols-outlined text-gray-400 mr-2 group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for GPUs, Keyboards, Monitors..."
              className="w-full bg-transparent border-none text-white text-sm focus:ring-0 p-0 placeholder-gray-500"
            />
          </div>
          <button className="px-8 py-3 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-pill transition-all shadow-[0_0_15px_rgba(13,242,242,0.4)] flex items-center justify-center gap-2">
            SEARCH
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap justify-center gap-4 mb-12">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-6 py-3 glass-panel rounded-pill flex items-center gap-2 hover:bg-white/10 hover:border-primary/50 transition-all group ${
              selectedCategory === cat.id ? 'bg-white/10 border-primary/50' : ''
            }`}
          >
            <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">
              {cat.icon}
            </span>
            <span className={`text-sm font-medium ${selectedCategory === cat.id ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
              {cat.name}
            </span>
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredProducts.length > 0 ? (
          filteredProducts.map((product) => (
            <div
              key={product.id}
              className="glass-panel rounded-[2rem] p-4 border border-white/5 hover:border-primary/50 transition-all group flex flex-col gap-4 cursor-pointer"
            >
              <div className="aspect-[4/3] rounded-[1.5rem] bg-black/50 overflow-hidden relative">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-bold border backdrop-blur ${product.statusColor}`}>
                  {product.status}
                </div>
              </div>
              <div className="px-2 pb-2">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                    {product.name}
                  </h4>
                  <span className="text-white font-mono">${product.price}</span>
                </div>
                <p className="text-gray-500 text-sm mb-4 line-clamp-1">{product.description}</p>
                <button className="w-full py-3 rounded-xl bg-white/5 hover:bg-primary hover:text-bg-dark text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                  ADD TO BUILD
                  <span className="material-symbols-outlined text-base">add</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full flex items-center justify-center py-12">
            <div className="text-center">
              <span className="material-symbols-outlined text-6xl text-gray-600 mx-auto block mb-4">
                shopping_cart
              </span>
              <p className="text-gray-400">No products found matching your criteria</p>
            </div>
          </div>
        )}
      </div>
    </main>
    </>
  );
}
