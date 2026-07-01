import { useState } from 'react';
import { useReviewQueue, useBlogCMS } from '../../hooks/useBlogCMS';
import type { BlogPost } from '../../hooks/useBlogCMS';
import type { Timestamp } from 'firebase/firestore';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pending Review', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  scheduled:      { label: 'Scheduled',       cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  return ts.toDate().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface EditState {
  id: string;
  title: string;
  content: string;
}

export default function ReviewConsole() {
  // useReviewQueue gives a server-side filtered onSnapshot — posts disappear
  // from this list the instant they are approved or rejected in Firestore.
  const { posts: queue, loading } = useReviewQueue();
  const { approvePost, rejectPost, updateBlogPost } = useBlogCMS();

  const [editState, setEditState] = useState<EditState | null>(null);
  const [rejectState, setRejectState] = useState<{ id: string; note: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);


  const handleApprove = async (post: BlogPost) => {
    setBusy(post.id);
    try {
      await approvePost(post.id, post.publishAt ?? undefined);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!rejectState) return;
    setBusy(rejectState.id);
    try {
      await rejectPost(rejectState.id, rejectState.note);
      setRejectState(null);
    } finally {
      setBusy(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editState) return;
    setBusy(editState.id);
    try {
      await updateBlogPost(editState.id, { title: editState.title, content: editState.content });
      setEditState(null);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-panel rounded-bento p-6 animate-pulse border border-white/5">
            <div className="h-3 bg-white/10 rounded w-1/4 mb-3" />
            <div className="h-5 bg-white/10 rounded w-3/4 mb-2" />
            <div className="h-3 bg-white/5 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="material-symbols-outlined text-5xl text-green-500/60 mb-4">check_circle</span>
        <p className="text-white font-bold text-lg">Review Queue is Clear</p>
        <p className="text-gray-500 text-sm mt-1">No posts awaiting moderation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {queue.map((post) => {
        const meta = STATUS_META[post.status];
        const isEditing = editState?.id === post.id;
        const isRejecting = rejectState?.id === post.id;
        const isBusy = busy === post.id;

        return (
          <div
            key={post.id}
            className="glass-panel rounded-bento border border-white/10 p-4 sm:p-6 hover:border-white/20 transition-all"
          >
            {/* Top row */}
            <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {meta && (
                  <span className={`px-3 py-1 rounded-full text-[11px] font-bold border ${meta.cls}`}>
                    {meta.label}
                  </span>
                )}
                <span className="px-3 py-1 rounded-full text-[11px] font-mono bg-white/5 text-gray-400 border border-white/10">
                  {post.category}
                </span>
                {post.authorType === 'ai_agent' && (
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-accent-purple/20 text-accent-purple border border-accent-purple/30">
                    AI Generated
                  </span>
                )}
              </div>
              {post.publishAt && (
                <span className="text-[11px] font-mono text-gray-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">schedule</span>
                  {formatTimestamp(post.publishAt)}
                </span>
              )}
            </div>

            {/* Title (editable) */}
            {isEditing ? (
              <input
                value={editState.title}
                onChange={(e) => setEditState((s) => s && { ...s, title: e.target.value })}
                className="w-full bg-black/40 border border-primary/40 rounded-lg px-3 py-2 text-white font-bold text-lg mb-2 focus:outline-none focus:border-primary"
              />
            ) : (
              <h3 className="text-white font-bold text-lg mb-1 leading-tight">{post.title}</h3>
            )}

            <p className="text-gray-500 text-xs font-mono mb-1">by {post.authorName}</p>

            {/* Excerpt / content (editable) */}
            {isEditing ? (
              <textarea
                value={editState.content}
                onChange={(e) => setEditState((s) => s && { ...s, content: e.target.value })}
                rows={6}
                className="w-full bg-black/40 border border-primary/40 rounded-lg px-3 py-2 text-gray-300 text-sm font-mono resize-none focus:outline-none focus:border-primary mb-3"
              />
            ) : (
              <p className="text-gray-400 text-sm line-clamp-2 mb-4">{post.excerpt}</p>
            )}

            {/* Reject note input */}
            {isRejecting && (
              <div className="mb-3">
                <input
                  value={rejectState.note}
                  onChange={(e) => setRejectState((s) => s && { ...s, note: e.target.value })}
                  placeholder="Rejection note for the author (optional)…"
                  className="w-full bg-black/40 border border-red-500/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isBusy}
                    className="min-h-10 px-4 py-2 text-xs font-bold rounded-full bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">save</span>
                    Save Edit
                  </button>
                  <button
                    onClick={() => setEditState(null)}
                    className="min-h-10 px-4 py-2 text-xs font-bold rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                </>
              ) : isRejecting ? (
                <>
                  <button
                    onClick={handleReject}
                    disabled={isBusy}
                    className="min-h-10 px-4 py-2 text-xs font-bold rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">block</span>
                    Confirm Reject
                  </button>
                  <button
                    onClick={() => setRejectState(null)}
                    className="min-h-10 px-4 py-2 text-xs font-bold rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleApprove(post)}
                    disabled={isBusy}
                    className="min-h-10 px-4 py-2 text-xs font-bold rounded-full bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all shadow-neon disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    {isBusy ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    onClick={() =>
                      setEditState({ id: post.id, title: post.title, content: post.content })
                    }
                    className="min-h-10 px-4 py-2 text-xs font-bold rounded-full bg-accent-purple/10 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/20 transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    Edit
                  </button>
                  <button
                    onClick={() => setRejectState({ id: post.id, note: '' })}
                    className="min-h-10 px-4 py-2 text-xs font-bold rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">cancel</span>
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
