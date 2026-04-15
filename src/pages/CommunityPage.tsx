import { useState } from 'react';
import { useStorage } from '../hooks/useStorage';
import GradientBackground from '../components/GradientBackground/GradientBackground';

export default function CommunityPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { data } = useStorage();

  const categories = [
    { name: 'All', icon: 'view_module', id: 'all' },
    { name: 'Hardware', icon: 'computer', id: 'hardware', color: 'text-accent-purple' },
    { name: 'Custom Loops', icon: 'water_drop', id: 'loops', color: 'text-blue-400' },
    { name: 'Software', icon: 'terminal', id: 'software', color: 'text-green-400' },
    { name: 'Build Logs', icon: 'build', id: 'builds', color: 'text-orange-400' },
    { name: 'Marketplace', icon: 'shopping_bag', id: 'marketplace', color: 'text-pink-400' },
  ];

  const forumPosts = data.communityPosts;

  const filteredPosts = forumPosts.filter((post) => {
    if (selectedCategory !== 'all' && post.category !== selectedCategory) return false;
    if (searchQuery && !post.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto w-full">
        {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-10">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 font-mono mb-2 pl-1">
            <a href="/" className="hover:text-primary transition-colors">
              HOME
            </a>
            <span className="material-symbols-outlined text-[12px]">chevron_right</span>
            <span className="text-white">COMMUNITY HUB</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight">Community Forum</h1>
          <p className="text-gray-400 max-w-xl">Join the discussion on custom loops, hardware modding, and the latest tech.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-grow md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics..."
              className="w-full bg-black/20 border border-white/10 rounded-pill py-2.5 pl-10 pr-4 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder-gray-600"
            />
          </div>
          <button className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-pill transition-all shadow-[0_0_15px_rgba(13,242,242,0.4)] whitespace-nowrap">
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Topic
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-4 overflow-x-auto pb-4 mb-8 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-pill text-sm font-medium whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-white/10 border border-white/10 text-white'
                : 'glass-panel text-gray-300 hover:text-primary hover:border-primary/50'
            }`}
          >
            <span className={`material-symbols-outlined text-[18px] ${cat.color || ''}`}>{cat.icon}</span>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Forum Posts List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">forum</span>
            {selectedCategory === 'all' ? 'All Discussions' : categories.find((c) => c.id === selectedCategory)?.name}
          </h2>
          <span className="text-sm text-gray-500">{filteredPosts.length} topics</span>
        </div>

        {filteredPosts.length > 0 ? (
          filteredPosts.map((post) => (
            <div
              key={post.id}
              className="glass-panel rounded-bento p-6 border border-white/10 hover:border-primary/30 transition-all hover:bg-white/[3%] cursor-pointer group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-grow">
                  <div className="flex items-center gap-3 mb-2">
                    {post.isPinned && (
                      <span className="material-symbols-outlined text-primary text-sm">push_pin</span>
                    )}
                    <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors">
                      {post.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400 font-mono">
                    <span>by {post.author}</span>
                    <span>•</span>
                    <span>{post.lastActivity}</span>
                  </div>
                </div>
                <div className="flex items-center gap-6 ml-4 shrink-0">
                  <div className="text-right">
                    <div className="font-bold text-white">{post.replies}</div>
                    <div className="text-xs text-gray-500">replies</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">{post.views}</div>
                    <div className="text-xs text-gray-500">views</div>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="glass-panel rounded-bento p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-gray-600 mx-auto block mb-4">
              forum
            </span>
            <p className="text-gray-400">No topics found matching your search</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-2 mt-12">
        <button className="px-4 py-2 glass-panel rounded-lg hover:bg-white/10 transition-all text-gray-300">
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <button className="px-4 py-2 bg-primary/20 text-primary rounded-lg border border-primary/30 font-bold">
          1
        </button>
        <button className="px-4 py-2 glass-panel rounded-lg hover:bg-white/10 transition-all text-gray-300">
          2
        </button>
        <button className="px-4 py-2 glass-panel rounded-lg hover:bg-white/10 transition-all text-gray-300">
          3
        </button>
        <button className="px-4 py-2 glass-panel rounded-lg hover:bg-white/10 transition-all text-gray-300">
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
    </main>
    </>
  );
}
