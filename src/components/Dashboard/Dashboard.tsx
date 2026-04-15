import React from 'react';
import { useStorage } from '../../hooks/useStorage';

interface DashboardProps {
  userName?: string;
}

const Dashboard: React.FC<DashboardProps> = ({
  userName = 'MUhammad Murtaza',
}) => {
  const { data } = useStorage();
  const builds = data.userBuilds || [];
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'completed':
        return 'bg-primary/20 text-primary border-primary/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1440px] mx-auto w-full">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Welcome back, <span className="text-primary">{userName}</span>
        </h1>
        <p className="text-gray-400 text-lg">Manage your PC builds, track components, and connect with the community.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div className="glass-panel rounded-bento p-6 border-l-4 border-l-primary">
          <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">Total Builds</p>
          <p className="text-4xl font-bold text-white">{builds.length}</p>
          <p className="text-primary text-xs font-mono mt-2">+2 this month</p>
        </div>
        <div className="glass-panel rounded-bento p-6 border-l-4 border-l-accent-purple">
          <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">Total Budget</p>
          <p className="text-4xl font-bold text-white">${builds.reduce((sum, b) => sum + b.budget, 0).toLocaleString()}</p>
          <p className="text-accent-purple text-xs font-mono mt-2">USD</p>
        </div>
        <div className="glass-panel rounded-bento p-6 border-l-4 border-l-green-500">
          <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">Published</p>
          <p className="text-4xl font-bold text-white">{builds.filter(b => b.status === 'published').length}</p>
          <p className="text-green-400 text-xs font-mono mt-2">Shared with community</p>
        </div>
        <div className="glass-panel rounded-bento p-6 border-l-4 border-l-blue-400">
          <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">Total Components</p>
          <p className="text-4xl font-bold text-white">{builds.reduce((sum, b) => sum + b.components, 0)}</p>
          <p className="text-blue-400 text-xs font-mono mt-2">Selected</p>
        </div>
      </div>

      {/* Builds Section */}
      <div>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold text-white">Your Builds</h2>
          <button className="px-6 py-3 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-pill transition-all shadow-[0_0_15px_rgba(13,242,242,0.4)] flex items-center gap-2">
            <span className="material-symbols-outlined">add</span>
            Create New Build
          </button>
        </div>

        {builds.length === 0 ? (
          <div className="glass-panel rounded-bento p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-gray-600 mx-auto block mb-4">
              build
            </span>
            <h3 className="text-xl font-bold text-white mb-2">No builds yet</h3>
            <p className="text-gray-400 mb-6">Create your first PC build to get started</p>
            <button className="px-6 py-3 bg-primary/20 hover:bg-primary/30 text-primary font-bold rounded-pill border border-primary/30 transition-all">
              Create First Build
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {builds.map((build) => (
              <div key={build.id} className="glass-panel rounded-bento p-6 overflow-hidden hover:border-primary/50 transition-all group flex flex-col">
                {/* Thumbnail */}
                <div className="aspect-video rounded-lg bg-gradient-to-br from-primary/20 to-accent-purple/20 mb-4 flex items-center justify-center overflow-hidden relative group">
                  {build.thumbnail ? (
                    <img
                      src={build.thumbnail}
                      alt={build.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-4xl text-primary/50">
                      computer
                    </span>
                  )}
                </div>

                {/* Build Info */}
                <div className="flex-grow">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-lg text-white line-clamp-2 group-hover:text-primary transition-colors flex-1">
                      {build.name}
                    </h3>
                    <button className="p-2 hover:bg-white/10 rounded-lg transition-colors shrink-0">
                      <span className="material-symbols-outlined text-gray-400 text-[20px]">
                        more_vert
                      </span>
                    </button>
                  </div>

                  <div className="flex gap-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(build.status)}`}>
                      {build.status.charAt(0).toUpperCase() + build.status.slice(1)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-gray-500 text-xs uppercase tracking-wider">Components</p>
                      <p className="text-lg font-bold text-white">{build.components}</p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-gray-500 text-xs uppercase tracking-wider">Budget</p>
                      <p className="text-lg font-bold text-primary">${build.budget}</p>
                    </div>
                  </div>

                  <p className="text-gray-500 text-xs font-mono">{build.createdDate}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                  <button className="flex-1 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary font-bold rounded-lg text-sm transition-all flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    Edit
                  </button>
                  <button className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg text-sm transition-all flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">share</span>
                    Share
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default Dashboard;