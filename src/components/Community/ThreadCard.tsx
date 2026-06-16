import type { Thread } from '../../hooks/useCommunity';
import { timeAgo, COMMUNITY_CATEGORIES } from '../../hooks/useCommunity';

const LIFECYCLE_BADGE = {
  open:   null,
  solved: { label: 'Solved',   classes: 'bg-green-500/15 border-green-500/30 text-green-400' },
  closed: { label: 'Archived', classes: 'bg-gray-500/15 border-gray-500/30 text-gray-400' },
} as const;

interface Props {
  thread: Thread;
  onClick: () => void;
  onVote: (voteType: 'upvote' | 'downvote') => void;
  currentUserId?: string;
}

export default function ThreadCard({ thread, onClick, onVote, currentUserId }: Props) {
  const hasUpvoted = !!currentUserId && thread.upvotedBy.includes(currentUserId);
  const hasDownvoted = !!currentUserId && thread.downvotedBy.includes(currentUserId);
  const isClosed = thread.lifecycleStatus === 'closed';

  const categoryLabel =
    COMMUNITY_CATEGORIES.find((c) => c.id === thread.category)?.name ?? thread.category;

  const lifecycle = LIFECYCLE_BADGE[thread.lifecycleStatus ?? 'open'];

  const handleVoteClick = (e: React.MouseEvent, voteType: 'upvote' | 'downvote') => {
    e.stopPropagation();
    onVote(voteType);
  };

  return (
    <div
      onClick={onClick}
      className={`glass-panel rounded-bento p-5 border transition-all cursor-pointer group ${
        isClosed
          ? 'border-black/5 dark:border-white/5 opacity-60 hover:opacity-80'
          : 'border-black/10 dark:border-white/10 hover:border-primary/30 hover:bg-black/[3%] dark:hover:bg-white/[3%]'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Vote column */}
        <div
          className="flex flex-col items-center gap-1 shrink-0 pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => handleVoteClick(e, 'upvote')}
            disabled={isClosed}
            className={`p-1 rounded transition-colors ${
              hasUpvoted
                ? 'text-primary'
                : 'text-gray-500 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title="Upvote"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
          </button>
          <span
            className={`text-sm font-bold font-mono ${
              thread.upvoteCount > 0 ? 'text-primary' : 'text-gray-400'
            }`}
          >
            {thread.upvoteCount}
          </span>
          <button
            onClick={(e) => handleVoteClick(e, 'downvote')}
            disabled={isClosed}
            className={`p-1 rounded transition-colors ${
              hasDownvoted
                ? 'text-accent-purple'
                : 'text-gray-500 hover:text-accent-purple disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title="Downvote"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_downward</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {categoryLabel}
            </span>
            {thread.country && (
              <span className="text-[11px] font-mono text-gray-500">{thread.country}</span>
            )}
            {lifecycle && (
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${lifecycle.classes}`}>
                {lifecycle.label}
              </span>
            )}
          </div>

          {thread.linkedBlogId && thread.linkedBlogTitle && (
            <div className="flex items-center gap-1.5 mt-1.5 mb-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-[11px] font-mono text-primary hover:border-primary/60 hover:shadow-[0_0_8px_rgba(13,242,242,0.15)] transition-all">
              <span className="material-symbols-outlined text-[13px]">link</span>
              <span className="shrink-0">Discussing Blog:</span>
              <span className="font-bold truncate">{thread.linkedBlogTitle}</span>
            </div>
          )}

          <h3 className={`font-bold text-base transition-colors truncate mb-1 ${
            isClosed ? 'text-gray-400' : 'text-white group-hover:text-primary'
          }`}>
            {thread.title}
          </h3>

          <p className="text-gray-400 text-sm line-clamp-2 mb-2">{thread.body}</p>

          {/* Image thumbnails */}
          {thread.images && thread.images.length > 0 && (
            <div className="flex gap-1.5 mb-2" onClick={e => e.stopPropagation()}>
              {thread.images.slice(0, 3).map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Thread image ${i + 1}`}
                  className="w-12 h-12 object-cover rounded-lg border border-black/10 dark:border-white/10 cursor-zoom-in"
                  onClick={e => { e.stopPropagation(); window.open(url, '_blank'); }}
                />
              ))}
              {thread.images.length > 3 && (
                <div className="w-12 h-12 rounded-lg border border-black/10 dark:border-white/10 bg-black/8 dark:bg-black/40 flex items-center justify-center text-xs text-gray-400 font-mono">
                  +{thread.images.length - 3}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
            <span>by {thread.authorName}</span>
            <span>•</span>
            <span>{timeAgo(thread.createdAt)}</span>
          </div>
        </div>

        {/* Reply count */}
        <div className="shrink-0 text-right pl-2">
          <div className="flex flex-col items-center gap-1">
            <span className="material-symbols-outlined text-gray-500 text-[18px]">forum</span>
            <span className="text-sm font-bold text-white">{thread.replyCount}</span>
            <span className="text-[10px] text-gray-500">replies</span>
          </div>
        </div>
      </div>
    </div>
  );
}
