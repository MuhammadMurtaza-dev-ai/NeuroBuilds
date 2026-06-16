import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useBlogFeed } from '../hooks/useBlogCMS';
import { useUserRole } from '../hooks/useUserRole';
import type { BlogPost } from '../hooks/useBlogCMS';
import { timeAgo } from '../hooks/useCommunity';
import GradientBackground from '../components/GradientBackground/GradientBackground';
import BlogEditor from '../components/Blog/BlogEditor';
import BlogPostModal from '../components/Blog/BlogPostModal';

export default function BlogPage() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole(user?.uid ?? null);
  const { posts, loading, error } = useBlogFeed(isAdmin);
  const location = useLocation();

  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const pendingOpenIdRef = useRef<string | null>(
    (location.state as { openPostId?: string } | null)?.openPostId ?? null
  );

  useEffect(() => {
    if (!pendingOpenIdRef.current || loading || posts.length === 0) return;
    const post = posts.find(p => p.id === pendingOpenIdRef.current);
    if (post) {
      setSelectedPost(post);
      pendingOpenIdRef.current = null;
    }
  }, [posts, loading]);

  const openEditor = (post?: BlogPost) => {
    setEditingPost(post ?? null);
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingPost(null);
  };

  const handleEditFromModal = (post: BlogPost) => {
    setSelectedPost(null);
    openEditor(post);
  };

  if (loading) {
    return (
      <>
        <GradientBackground />
        <main className="relative z-10 flex-grow flex items-center justify-center pt-32 pb-20">
          <div className="flex flex-col items-center gap-4 text-gray-400">
            <span className="material-symbols-outlined text-5xl text-primary animate-pulse">
              article
            </span>
            <p className="font-mono text-sm">Loading articles…</p>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <GradientBackground />
        <main className="relative z-10 flex-grow flex items-center justify-center pt-32 pb-20">
          <div className="text-center text-red-400">
            <span className="material-symbols-outlined text-4xl block mb-3">error</span>
            <p className="text-sm font-mono">{error}</p>
          </div>
        </main>
      </>
    );
  }

  const featuredPost = posts[0];
  const remainingPosts = posts.slice(1);
  const trendingPosts = [...posts]
    .sort((a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0))
    .slice(0, 4);

  return (
    <>
      <GradientBackground />

      {showEditor && (
        <BlogEditor
          isAdmin={isAdmin}
          authorId={user?.uid ?? ''}
          authorName={user?.displayName ?? 'Admin'}
          editingPost={editingPost}
          onClose={closeEditor}
        />
      )}

      {selectedPost && (
        <BlogPostModal
          post={selectedPost}
          isAdmin={isAdmin}
          onClose={() => setSelectedPost(null)}
          onEdit={handleEditFromModal}
        />
      )}

      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1440px] mx-auto w-full">
        {/* Page title row with admin New Post button */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-white tracking-tight">
            Blog
          </h1>
          {user && (
            <button
              onClick={() => openEditor()}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-full transition-all text-sm font-bold shadow-neon"
            >
              <span className="material-symbols-outlined text-[18px]">{isAdmin ? 'add' : 'edit'}</span>
              {isAdmin ? 'New Post' : 'Write a Post'}
            </button>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="glass-panel rounded-bento p-16 text-center">
            <span className="material-symbols-outlined text-5xl text-gray-600 block mb-4">
              article
            </span>
            <p className="text-gray-500 text-lg">No articles published yet.</p>
            {user && (
              <button
                onClick={() => openEditor()}
                className="mt-6 px-6 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-full text-sm font-bold transition-all"
              >
                {isAdmin ? 'Write the first post' : 'Write a post'}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Featured Article + Trending Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
              {featuredPost && (
                <div
                  className="lg:col-span-8 h-[500px] relative rounded-bento overflow-hidden group border border-black/10 dark:border-white/10 shadow-2xl cursor-pointer"
                  onClick={() => setSelectedPost(featuredPost)}
                >
                  {featuredPost.thumbnailUrl ? (
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url("${featuredPost.thumbnailUrl}")` }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-bg-panel to-bg-dark" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent" />

                  <div className="absolute bottom-0 left-0 p-8 md:p-12 w-full z-20">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-3 py-1 rounded-full bg-primary/20 backdrop-blur-md text-xs font-bold text-primary border border-primary/20">
                        FEATURED STORY
                      </span>
                      {!featuredPost.isPublished && (
                        <span className="px-3 py-1 rounded-full bg-amber-500/20 backdrop-blur-md text-xs font-bold text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">edit</span>
                          Draft
                        </span>
                      )}
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight max-w-3xl">
                      {featuredPost.title}
                    </h2>
                    <p className="text-gray-300 text-lg line-clamp-2 max-w-2xl mb-6">
                      {featuredPost.excerpt}
                    </p>
                    <div className="flex items-center gap-6 text-sm text-gray-400 font-mono">
                      {featuredPost.createdAt && (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-primary">
                            calendar_today
                          </span>
                          {featuredPost.createdAt.toDate().toLocaleDateString()}
                        </span>
                      )}
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-accent-purple">
                          person
                        </span>
                        by {featuredPost.authorName}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Trending Sidebar */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                <div className="glass-panel rounded-bento p-8 h-full flex flex-col border-t-4 border-t-accent-purple">
                  <h3 className="font-bold text-xl mb-6 flex items-center gap-2 pb-4 border-b border-black/8 dark:border-white/5">
                    <span className="material-symbols-outlined text-accent-purple">flash_on</span>
                    Trending Now
                  </h3>
                  <div className="flex flex-col gap-6 overflow-y-auto pr-2 flex-grow">
                    {trendingPosts.length > 0 ? trendingPosts.map(post => (
                      <div key={post.id} className="group block hover:opacity-80 transition-opacity cursor-pointer" onClick={() => setSelectedPost(post)}>
                        <span className="text-[10px] tracking-wider font-bold text-accent-purple mb-1 block uppercase">
                          {post.category}
                        </span>
                        <h4 className="font-bold text-white text-lg leading-snug group-hover:text-primary transition-colors line-clamp-2">
                          {post.title}
                        </h4>
                        <span className="text-gray-500 text-xs font-mono mt-2 block">
                          {post.createdAt ? timeAgo(post.createdAt.toDate().toISOString()) : '—'}
                        </span>
                      </div>
                    )) : (
                      <p className="text-gray-600 text-xs text-center py-6">No posts yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Articles Grid */}
            {remainingPosts.length > 0 && (
              <div>
                <h2 className="text-3xl font-bold text-white mb-8 tracking-tight">
                  Recent Articles{' '}
                  <span className="text-gray-600 text-lg font-normal ml-2">// Latest Posts</span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {remainingPosts.map((post) => (
                    <article
                      key={post.id}
                      onClick={() => setSelectedPost(post)}
                      className="glass-panel rounded-bento overflow-hidden hover:border-primary/50 transition-all group cursor-pointer"
                    >
                      <div className="h-48 overflow-hidden relative">
                        {post.thumbnailUrl ? (
                          <img
                            src={post.thumbnailUrl}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-bg-panel to-bg-dark flex items-center justify-center">
                            <span className="material-symbols-outlined text-4xl text-gray-700">
                              article
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

                        {/* Badges */}
                        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                          <span className="px-3 py-1 rounded-full bg-primary/20 backdrop-blur text-xs font-bold text-primary border border-primary/20">
                            {post.category}
                          </span>
                          {!post.isPublished && (
                            <span className="px-3 py-1 rounded-full bg-amber-500/20 backdrop-blur text-xs font-bold text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">edit</span>
                              Draft
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-6">
                        <h3 className="font-bold text-lg text-white mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                          {post.title}
                        </h3>
                        <p className="text-gray-400 text-sm mb-4 line-clamp-2">{post.excerpt}</p>
                        <div className="flex items-center justify-between text-xs text-gray-500 font-mono pt-4 border-t border-black/8 dark:border-white/5">
                          <span>
                            {post.authorName}
                            {post.createdAt && (
                              <> • {post.createdAt.toDate().toLocaleDateString()}</>
                            )}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditor(post);
                              }}
                              className="text-gray-600 hover:text-primary transition-colors"
                              title="Edit"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
