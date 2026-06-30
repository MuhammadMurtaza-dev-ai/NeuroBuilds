import type { BlogPost } from '../../hooks/useBlogCMS';
import BlogComments from './BlogComments';

interface BlogPostModalProps {
  post: BlogPost;
  isAdmin: boolean;
  onClose: () => void;
  onEdit?: (post: BlogPost) => void;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

const formatDate = (ts: BlogPost['createdAt']): string => {
  if (!ts) return '';
  const date = ts.toDate();
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

// Escape HTML before applying markdown transforms so raw post content
// (incl. AI/user-authored) cannot inject <script>/<img onerror>/<iframe>.
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderMarkdown = (text: string): string => {
  return escapeHtml(text)
    .replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold text-white mt-8 mb-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold text-white mt-10 mb-4">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold text-white mt-12 mb-5">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-gray-300 italic">$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-white/10 text-primary px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-primary/50 pl-4 my-4 text-gray-400 italic">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li class="text-gray-300 ml-4 list-disc mb-1">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-gray-300 leading-relaxed mb-4">')
    .replace(/^(?!<[h|l|b])(.+)$/gm, (match) =>
      match.startsWith('<') ? match : `<span>${match}</span>`
    );
};

const STATUS_BADGES: Record<string, { label: string; cls: string } | undefined> = {
  draft:          { label: 'Draft',          cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  pending_review: { label: 'Pending Review', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  scheduled:      { label: 'Scheduled',      cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

export default function BlogPostModal({ post, isAdmin, onClose, onEdit }: BlogPostModalProps) {
  const statusBadge = STATUS_BADGES[post.status];
  const embedId = post.videoUrl ? extractYouTubeId(post.videoUrl) : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-panel rounded-bento w-full max-w-3xl max-h-[90vh] flex flex-col border border-white/10 shadow-2xl overflow-hidden">
        {/* Hero thumbnail (only when no video embed) */}
        {post.thumbnailUrl && !embedId && (
          <div className="h-64 relative shrink-0 overflow-hidden">
            <img
              src={post.thumbnailUrl}
              alt={post.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1e1e1e] via-[#1e1e1e]/40 to-transparent" />
          </div>
        )}

        {/* YouTube embed */}
        {embedId && (
          <div className="aspect-video w-full shrink-0 overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${embedId}`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            />
          </div>
        )}

        {/* Header */}
        <div className="px-8 pt-6 pb-4 shrink-0 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-grow">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="px-3 py-1 rounded-full bg-primary/20 text-xs font-bold text-primary border border-primary/20 uppercase tracking-wide">
                  {post.category}
                </span>
                {statusBadge && (
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${statusBadge.cls}`}>
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    {statusBadge.label}
                  </span>
                )}
                {post.authorType === 'ai_agent' && (
                  <span className="px-3 py-1 rounded-full bg-accent-purple/20 text-xs font-bold text-accent-purple border border-accent-purple/30 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                    AI Generated
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                {post.title}
              </h1>
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-accent-purple">person</span>
                  {post.authorName}
                </span>
                {post.createdAt && (
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] text-primary">calendar_today</span>
                    {formatDate(post.createdAt)}
                  </span>
                )}
                {post.commentCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] text-gray-500">comment</span>
                    {post.commentCount}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && onEdit && (
                <button
                  onClick={() => onEdit(post)}
                  className="p-2 text-gray-400 hover:text-primary transition-colors"
                  title="Edit post"
                >
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-grow px-8 py-6">
          <div
            className="prose-blog text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: `<p class="text-gray-300 leading-relaxed mb-4">${renderMarkdown(post.content)}</p>`,
            }}
          />

          {/* Comments */}
          <div className="mt-10 pt-8 border-t border-white/10">
            <BlogComments postId={post.id} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-white/10 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-all text-sm font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
