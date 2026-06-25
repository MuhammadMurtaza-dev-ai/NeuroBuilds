import { useState } from 'react';
import { useBlogComments } from '../../hooks/useBlogComments';
import { useAuth } from '../../hooks/useAuth';
import { timeAgo } from '../../utils/datetime';

interface Props {
  postId: string;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function BlogComments({ postId }: Props) {
  const { user } = useAuth();
  const { comments, loading, error, addComment, deleteComment } = useBlogComments(postId);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await addComment(draft);
      setDraft('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId);
    } catch {
      // silently ignore — comment may already be gone
    }
  };

  return (
    <section>
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <span className="material-symbols-outlined text-primary text-[20px]">comment</span>
        <h3 className="text-sm font-bold text-white uppercase tracking-widest font-mono">
          Comments
          {!loading && (
            <span className="ml-2 text-primary">({comments.length})</span>
          )}
        </h3>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="size-8 rounded-full bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-white/10 rounded w-1/4" />
                <div className="h-10 bg-white/5 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm font-mono mb-4">{error}</p>
      )}

      {/* Comment list */}
      {!loading && (
        <div className="space-y-4 mb-6">
          {comments.length === 0 && (
            <p className="text-gray-600 text-sm italic text-center py-4">
              Be the first to comment on this post.
            </p>
          )}
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="flex gap-3 group glass-panel rounded-xl p-4 border border-white/5 hover:border-primary/20 transition-all"
            >
              {/* Avatar */}
              <div className="size-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                <span className="text-primary text-[11px] font-bold font-mono">
                  {initials(comment.authorName) || '?'}
                </span>
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-white text-xs font-semibold">{comment.authorName}</span>
                  <span className="text-gray-600 text-[10px] font-mono">
                    {timeAgo(comment.createdAt)}
                  </span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{comment.body}</p>
              </div>

              {/* Delete — own comments only */}
              {user && user.uid === comment.authorId && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="shrink-0 p-1 text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete comment"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add comment */}
      {user ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a comment…"
            rows={3}
            maxLength={1000}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none transition-colors resize-none font-mono"
          />
          {submitError && (
            <p className="text-red-400 text-xs font-mono">{submitError}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="px-5 py-2 text-sm bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-full transition-all font-bold shadow-neon disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              {submitting ? 'Posting…' : 'Post Comment'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-gray-600 text-sm text-center py-3 border border-white/5 rounded-xl">
          <span className="text-primary font-medium">Sign in</span> to join the discussion
        </p>
      )}
    </section>
  );
}
