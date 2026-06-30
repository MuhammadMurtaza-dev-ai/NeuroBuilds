import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCommunity, COMMUNITY_COUNTRIES } from '../hooks/useCommunity';
import { useAuth } from '../hooks/useAuth';
import { useBlogFeed } from '../hooks/useBlogCMS';
import CyberSelect from '../components/CyberSelect';
import { useCountry } from '../context/CountryContext';
import { useUserRole } from '../hooks/useUserRole';
import GradientBackground from '../components/GradientBackground/GradientBackground';
import ThreadCard from '../components/Community/ThreadCard';
import ThreadDetailModal from '../components/Community/ThreadDetailModal';
import CreateThreadModal from '../components/Community/CreateThreadModal';
import NewsFallback from '../components/NewsFallback/NewsFallback';
import type { Thread } from '../hooks/useCommunity';

const CATEGORIES = [
  { name: 'All', icon: 'view_module', id: 'all' },
  { name: 'Hardware', icon: 'computer', id: 'hardware', color: 'text-accent-purple' },
  { name: 'Custom Loops', icon: 'water_drop', id: 'loops', color: 'text-blue-400' },
  { name: 'Software', icon: 'terminal', id: 'software', color: 'text-green-400' },
  { name: 'Build Logs', icon: 'build', id: 'builds', color: 'text-orange-400' },
  { name: 'Marketplace', icon: 'shopping_bag', id: 'marketplace', color: 'text-pink-400' },
];

interface Props {
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export default function CommunityPage({ onOpenAuth }: Props) {
  const { user } = useAuth();
  const { selectedCountry } = useCountry();
  const { role } = useUserRole(user?.uid);
  const location = useLocation();
  const {
    threads,
    allThreads,
    loading,
    error,
    filters,
    setFilters,
    createThread,
    addReply,
    subscribeToReplies,
    handleVote,
    deleteThread,
    updateThread,
    updateThreadLifecycle,
  } = useCommunity();

  const { posts: blogPosts } = useBlogFeed(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingThread, setEditingThread] = useState<Thread | null>(null);

  const availablePosts = blogPosts.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
  }));

  const pendingOpenThreadIdRef = useRef<string | null>(
    (location.state as { openThreadId?: string } | null)?.openThreadId ?? null
  );

  useEffect(() => {
    if (!pendingOpenThreadIdRef.current || loading || allThreads.length === 0) return;
    const thread = allThreads.find(t => t.id === pendingOpenThreadIdRef.current);
    if (thread) {
      setActiveThread(thread);
      pendingOpenThreadIdRef.current = null;
    }
  }, [allThreads, loading]);

  // Keep open modal in sync with live Firestore snapshot updates
  useEffect(() => {
    if (!activeThread) return;
    const updated = threads.find((t) => t.id === activeThread.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: keep open modal in sync with Firestore updates
    if (updated) setActiveThread(updated);
  }, [threads]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewTopicClick = () => {
    if (!user) {
      onOpenAuth('login');
      return;
    }
    setShowCreate(true);
  };

  const handleThreadClick = (thread: Thread) => {
    setActiveThread(thread);
  };

  const handleVoteOnCard = (threadId: string, voteType: 'upvote' | 'downvote') => {
    if (!user) {
      onOpenAuth('login');
      return;
    }
    handleVote(threadId, voteType).catch(console.error);
  };

  const handleVoteInModal = async (voteType: 'upvote' | 'downvote') => {
    if (!user) {
      onOpenAuth('login');
      return;
    }
    if (activeThread) await handleVote(activeThread.id, voteType);
  };

  const handleDeleteThread = async () => {
    if (!activeThread) return;
    await deleteThread(activeThread.id);
    setActiveThread(null);
  };

  const handleEditThreadClick = () => {
    if (!activeThread) return;
    setEditingThread(activeThread);
    setActiveThread(null);
  };

  const handleEditThreadSubmit = async (
    title: string,
    body: string,
    category: string,
    country: string,
  ) => {
    if (!editingThread) return;
    await updateThread(editingThread.id, { title, body, category, country });
    setActiveThread({ ...editingThread, title, body, category, country });
    setEditingThread(null);
  };

  const handleEditThreadClose = () => {
    setActiveThread(editingThread);
    setEditingThread(null);
  };

  const visibleThreads = threads.filter((t) => {
    if (!searchQuery) return true;
    return (
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.body.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight">
              Community Forum
            </h1>
            <p className="text-gray-400 max-w-xl">
              Join the discussion on custom loops, hardware modding, and the latest tech.
            </p>
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
                className="w-full bg-bg-panel border border-border-glass rounded-pill py-2.5 pl-10 pr-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder-[var(--text-muted)]"
              />
            </div>
            <button
              onClick={handleNewTopicClick}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-pill transition-all shadow-[0_0_15px_rgba(13,242,242,0.4)] whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Topic
            </button>
          </div>
        </div>

        {/* Filters row: category tabs + country dropdown */}
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar flex-grow">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilters({ ...filters, category: cat.id })}
                className={`flex items-center gap-2 px-5 py-2 rounded-pill text-sm font-medium whitespace-nowrap transition-all ${
                  filters.category === cat.id
                    ? 'bg-black/8 dark:bg-white/10 border border-black/12 dark:border-white/10'
                    : 'glass-panel hover:text-primary hover:border-primary/50'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${cat.color ?? ''}`}>
                  {cat.icon}
                </span>
                {cat.name}
              </button>
            ))}
          </div>

          {/* Country filter */}
          <CyberSelect
            value={filters.country}
            onChange={v => setFilters({ ...filters, country: v })}
            options={[
              { value: 'All', label: 'All Countries' },
              ...COMMUNITY_COUNTRIES.map(c => ({ value: c, label: c })),
            ]}
            className="shrink-0"
          />
        </div>

        {/* Thread list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">forum</span>
              {filters.category === 'all'
                ? 'All Discussions'
                : CATEGORIES.find((c) => c.id === filters.category)?.name}
            </h2>
            <span className="text-sm text-gray-500">{visibleThreads.length} topics</span>
          </div>

          {loading && (
            <div className="glass-panel rounded-bento p-12 text-center">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin block mx-auto mb-3">
                progress_activity
              </span>
              <p className="text-gray-400 text-sm">Loading threads…</p>
            </div>
          )}

          {error && (
            <div className="glass-panel rounded-bento p-8 text-center border border-red-500/20">
              <span className="material-symbols-outlined text-4xl text-red-400 block mx-auto mb-3">
                error
              </span>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && visibleThreads.length === 0 && threads.length === 0 && (
            <div className="grid grid-cols-1">
              <NewsFallback country={selectedCountry} context="community" />
            </div>
          )}

          {!loading && !error && visibleThreads.length === 0 && threads.length > 0 && (
            <div className="glass-panel rounded-bento p-12 text-center">
              <span className="material-symbols-outlined text-6xl text-gray-600 mx-auto block mb-4">
                forum
              </span>
              <p className="text-gray-400">No topics match your search. Try different keywords.</p>
            </div>
          )}

          {!loading &&
            visibleThreads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                onClick={() => handleThreadClick(thread)}
                onVote={(voteType) => handleVoteOnCard(thread.id, voteType)}
                currentUserId={user?.uid}
              />
            ))}
        </div>
      </main>

      {showCreate && (
        <CreateThreadModal
          onClose={() => setShowCreate(false)}
          onSubmit={createThread}
          availablePosts={availablePosts}
        />
      )}

      {editingThread && (
        <CreateThreadModal
          onClose={handleEditThreadClose}
          onSubmit={handleEditThreadSubmit}
          initialThread={editingThread}
        />
      )}

      {activeThread && (
        <ThreadDetailModal
          thread={activeThread}
          onClose={() => setActiveThread(null)}
          onVote={handleVoteInModal}
          onAddReply={addReply}
          subscribeToReplies={subscribeToReplies}
          currentUserId={user?.uid}
          userRole={role}
          onOpenAuth={onOpenAuth}
          onDelete={handleDeleteThread}
          onEditClick={handleEditThreadClick}
          onUpdateLifecycle={async (status) => {
            await updateThreadLifecycle(activeThread.id, status);
          }}
        />
      )}
    </>
  );
}
