import type { Reply } from '../../hooks/useCommunity';
import { timeAgo } from '../../hooks/useCommunity';

interface Props {
  reply: Reply;
  depth?: number;
  onReplyClick: (parentId: string) => void;
  currentUserId?: string;
  onOpenAuth?: () => void;
}

export default function ReplyItem({ reply, depth = 0, onReplyClick, currentUserId, onOpenAuth }: Props) {
  const isOwn = reply.authorId === currentUserId;
  const indent = Math.min(depth, 3) * 20;

  return (
    <div
      style={{ marginLeft: indent }}
      className="border-l-2 border-white/5 pl-4 py-3"
    >
      <div className="flex items-start gap-3">
        {/* Avatar placeholder */}
        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-xs font-bold text-gray-400">
          {reply.authorName.charAt(0).toUpperCase()}
        </div>

        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-sm font-semibold ${isOwn ? 'text-primary' : 'text-white'}`}>
              {reply.authorName}
            </span>
            {isOwn && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                you
              </span>
            )}
            <span className="text-xs text-gray-500 font-mono">{timeAgo(reply.createdAt)}</span>
          </div>

          <p className="text-gray-300 text-sm leading-relaxed">{reply.body}</p>

          {reply.images && reply.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {reply.images.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Reply image ${i + 1}`}
                  className="w-16 h-16 object-cover rounded-lg border border-white/10 cursor-zoom-in"
                  onClick={() => window.open(url, '_blank')}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => currentUserId ? onReplyClick(reply.id) : onOpenAuth?.()}
            className="mt-1.5 text-xs text-gray-500 hover:text-primary transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">reply</span>
            {currentUserId ? 'Reply' : 'Sign in to reply'}
          </button>
        </div>
      </div>
    </div>
  );
}
