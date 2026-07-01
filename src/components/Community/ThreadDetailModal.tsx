import { useState, useEffect, useRef } from 'react';
import { ImagePlus, Loader, X, Lock } from 'lucide-react';
import type { Thread, Reply } from '../../hooks/useCommunity';
import { timeAgo, COMMUNITY_CATEGORIES } from '../../hooks/useCommunity';
import type { UserRole } from '../../hooks/useUserRole';
import ReplyItem from './ReplyItem';
import { uploadImageToImgBB } from '../../utils/imageUploader';

const MAX_REPLY_IMAGES = 2;

const LIFECYCLE_BADGE = {
  open:   null,
  solved: { label: 'Solved',   classes: 'bg-green-500/15 border-green-500/30 text-green-400' },
  closed: { label: 'Archived', classes: 'bg-gray-500/15 border-gray-500/30 text-gray-400' },
} as const;

interface Props {
  thread: Thread;
  onClose: () => void;
  onVote: (voteType: 'upvote' | 'downvote') => Promise<void>;
  onAddReply: (threadId: string, body: string, parentId: string | null, images?: string[]) => Promise<void>;
  subscribeToReplies: (
    threadId: string,
    onReplies: (replies: Reply[]) => void
  ) => () => void;
  currentUserId?: string;
  userRole?: UserRole;
  onOpenAuth?: (mode: 'login' | 'register') => void;
  onDelete?: () => Promise<void>;
  onEditClick?: () => void;
  onUpdateLifecycle?: (status: 'solved' | 'closed') => Promise<void>;
}

export default function ThreadDetailModal({
  thread,
  onClose,
  onVote,
  onAddReply,
  subscribeToReplies,
  currentUserId,
  userRole,
  onOpenAuth,
  onDelete,
  onEditClick,
  onUpdateLifecycle,
}: Props) {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  // Reply image upload
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [uploadingReplyImages, setUploadingReplyImages] = useState(false);
  const replyFileRef = useRef<HTMLInputElement>(null);

  const hasUpvoted = !!currentUserId && thread.upvotedBy.includes(currentUserId);
  const hasDownvoted = !!currentUserId && thread.downvotedBy.includes(currentUserId);
  const isOwner = !!currentUserId && currentUserId === thread.authorId;
  const isModerator = userRole === 'moderator' || userRole === 'admin';
  const isClosed = thread.lifecycleStatus === 'closed';
  const isSolved = thread.lifecycleStatus === 'solved';

  const handleDelete = async () => {
    if (!window.confirm('Permanently delete this thread and all its replies? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await onDelete?.();
    } finally {
      setDeleting(false);
    }
  };

  const handleLifecycle = async (status: 'solved' | 'closed') => {
    setLifecycleLoading(true);
    try {
      await onUpdateLifecycle?.(status);
    } finally {
      setLifecycleLoading(false);
    }
  };

  const categoryLabel =
    COMMUNITY_CATEGORIES.find((c) => c.id === thread.category)?.name ?? thread.category;

  const lifecycle = LIFECYCLE_BADGE[thread.lifecycleStatus ?? 'open'];

  useEffect(() => {
    const unsub = subscribeToReplies(thread.id, setReplies);
    return () => unsub();
  }, [thread.id, subscribeToReplies]);

  const handleReplyClick = (parentId: string) => {
    setReplyingToId(parentId);
    setTimeout(() => replyInputRef.current?.focus(), 50);
  };

  const handleReplyImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_REPLY_IMAGES - replyImages.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploadingReplyImages(true);
    try {
      const urls = await Promise.all(toUpload.map(f => uploadImageToImgBB(f)));
      setReplyImages(prev => [...prev, ...urls]);
    } catch {
      setReplyError('Image upload failed. Check your ImgBB API key.');
    } finally {
      setUploadingReplyImages(false);
      if (replyFileRef.current) replyFileRef.current.value = '';
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setSubmitting(true);
    setReplyError(null);
    try {
      await onAddReply(
        thread.id,
        replyBody.trim(),
        replyingToId,
        replyImages.length > 0 ? replyImages : undefined
      );
      setReplyBody('');
      setReplyingToId(null);
      setReplyImages([]);
    } catch (err: unknown) {
      setReplyError(err instanceof Error ? err.message : 'Failed to post reply.');
    } finally {
      setSubmitting(false);
    }
  };

  // Build a reply depth map for visual indentation
  const depthMap = new Map<string, number>();
  replies.forEach((r) => {
    if (!r.parentId) {
      depthMap.set(r.id, 0);
    } else {
      depthMap.set(r.id, (depthMap.get(r.parentId) ?? 0) + 1);
    }
  });

  const replyingToAuthor = replyingToId
    ? replies.find((r) => r.id === replyingToId)?.authorName
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[calc(100vw-1.5rem)] sm:max-w-3xl h-[90vh] flex flex-col glass-panel rounded-bento border border-white/10 shadow-neon overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {categoryLabel}
            </span>
            {thread.country && (
              <span className="text-xs font-mono text-gray-500">{thread.country}</span>
            )}
            {lifecycle && (
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${lifecycle.classes}`}>
                {lifecycle.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="size-10 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0" aria-label="Close thread details">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-grow overflow-y-auto px-4 sm:px-8 py-5 sm:py-6 space-y-6">
          {/* Thread body */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 leading-tight">{thread.title}</h2>
            <div className="flex items-center gap-3 text-xs text-gray-500 font-mono mb-4">
              <span>{thread.authorName}</span>
              <span>•</span>
              <span>{timeAgo(thread.createdAt)}</span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{thread.body}</p>

            {/* Thread images */}
            {thread.images && thread.images.length > 0 && (
              <div className="flex gap-2 mt-4 overflow-x-auto pb-1 snap-x snap-mandatory mask-gradient">
                {thread.images.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Thread image ${i + 1}`}
                    className="h-36 sm:max-h-48 w-56 sm:w-72 object-cover rounded-xl border border-white/10 cursor-zoom-in shrink-0 snap-start"
                    onClick={() => window.open(url, '_blank')}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Vote bar */}
          <div className="flex items-center gap-3 py-3 border-t border-b border-white/5 flex-wrap">
            <button
              onClick={() => onVote('upvote')}
              disabled={isClosed}
              className={`min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                hasUpvoted
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'text-gray-400 hover:text-primary hover:bg-primary/10 border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
              {thread.upvoteCount}
            </button>
            <button
              onClick={() => onVote('downvote')}
              disabled={isClosed}
              className={`min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                hasDownvoted
                  ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40'
                  : 'text-gray-400 hover:text-accent-purple hover:bg-accent-purple/10 border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
            </button>
            <span className="text-xs text-gray-500 ml-2 font-mono">
              {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
            </span>

            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
              {/* Lifecycle actions */}
              {currentUserId && !isClosed && (
                <>
                  {isOwner && !isSolved && (
                    <button
                      onClick={() => handleLifecycle('solved')}
                      disabled={lifecycleLoading}
                      className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[15px]">check_circle</span>
                      Mark Solved
                    </button>
                  )}
                  {isModerator && (
                    <button
                      onClick={() => handleLifecycle('closed')}
                      disabled={lifecycleLoading}
                      className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-500/30 bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition-all disabled:opacity-50"
                    >
                      <Lock size={13} />
                      Close Thread
                    </button>
                  )}
                </>
              )}

              {/* Owner edit / delete */}
              {isOwner && (
                <>
                  <button
                    onClick={onEditClick}
                    className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {deleting ? 'progress_activity' : 'delete'}
                    </span>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Replies */}
          {replies.length > 0 ? (
            <div className="space-y-1">
              {replies.map((r) => (
                <ReplyItem
                  key={r.id}
                  reply={r}
                  depth={depthMap.get(r.id) ?? 0}
                  onReplyClick={handleReplyClick}
                  currentUserId={currentUserId}
                  onOpenAuth={onOpenAuth ? () => onOpenAuth('login') : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              No replies yet. Be the first to respond.
            </div>
          )}
        </div>

        {/* Reply form — pinned at bottom */}
        <div className="shrink-0 px-4 sm:px-8 py-4 sm:py-5 border-t border-white/10 bg-bg-dark/60">
          {isClosed ? (
            <div className="flex items-center gap-3 py-2 px-4 rounded-xl bg-gray-500/10 border border-gray-500/20">
              <Lock size={15} className="text-gray-500 shrink-0" />
              <p className="text-sm text-gray-500 font-mono">THREAD ARCHIVED — no new replies allowed</p>
            </div>
          ) : currentUserId ? (
            <>
              {replyingToId && (
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-2 font-mono">
                  <span className="material-symbols-outlined text-[14px]">reply</span>
                  Replying to <span className="text-primary">{replyingToAuthor}</span>
                  <button
                    onClick={() => setReplyingToId(null)}
                    className="ml-auto text-gray-600 hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              )}

              {/* Reply image previews */}
              {replyImages.length > 0 && (
                <div className="flex gap-2 mb-2">
                  {replyImages.map((url, i) => (
                    <div key={i} className="relative group">
                      <img src={url} alt="" className="w-14 h-14 object-cover rounded-lg border border-white/10" />
                      <button
                        type="button"
                        onClick={() => setReplyImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-2 -right-2 size-8 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Remove reply image"
                      >
                        <X size={9} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmitReply} className="flex flex-col sm:flex-row gap-3">
                <div className="flex-grow flex flex-col gap-1.5">
                  <textarea
                    ref={replyInputRef}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmitReply(e);
                    }}
                    placeholder="Write a reply… (Ctrl+Enter to submit)"
                    rows={2}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-primary/50 focus:outline-none resize-none transition-colors"
                  />
                  <div className="flex items-center gap-2">
                    {replyImages.length < MAX_REPLY_IMAGES && (
                      <>
                        <input
                          ref={replyFileRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={e => handleReplyImageFiles(e.target.files)}
                        />
                        <button
                          type="button"
                          onClick={() => replyFileRef.current?.click()}
                          disabled={uploadingReplyImages}
                          className="min-h-11 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all disabled:opacity-50"
                        >
                          {uploadingReplyImages ? <Loader size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                          {uploadingReplyImages ? 'Uploading…' : `Add image (${replyImages.length}/${MAX_REPLY_IMAGES})`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting || !replyBody.trim() || uploadingReplyImages}
                  className="min-h-11 px-5 py-3 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-xl transition-all shadow-[0_0_10px_rgba(13,242,242,0.3)] disabled:opacity-40 disabled:cursor-not-allowed self-stretch sm:self-end"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                </button>
              </form>
              {replyError && (
                <p className="text-red-400 text-xs mt-2">{replyError}</p>
              )}
            </>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-1">
              <p className="text-sm text-gray-400">
                <span className="material-symbols-outlined text-[16px] align-middle mr-1.5 text-gray-500">lock</span>
                Sign in to join the discussion
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => onOpenAuth?.('login')}
                  className="px-4 py-2 text-sm glass-panel rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                >
                  Sign In
                </button>
                <button
                  onClick={() => onOpenAuth?.('register')}
                  className="px-4 py-2 text-sm bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-xl transition-all shadow-[0_0_10px_rgba(13,242,242,0.3)]"
                >
                  Register
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
