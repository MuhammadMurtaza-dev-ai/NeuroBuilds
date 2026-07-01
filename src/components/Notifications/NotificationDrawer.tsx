import { useNavigate } from 'react-router-dom';
import { CheckCheck, Bell } from 'lucide-react';
import type { UseNotificationsResult } from '../../hooks/useNotifications';

const TYPE_LABELS: Record<string, string> = {
  blog_comment: 'Blog',
  thread_reply: 'Community',
  marketplace_message: 'Marketplace',
  ai_build_ready: 'AI',
  listing_expired: 'Listing',
};

interface Props {
  notif: UseNotificationsResult;
  onClose: () => void;
}

export function NotificationDrawer({ notif, onClose }: Props) {
  const navigate = useNavigate();

  const handleClick = async (id: string, linkUrl?: string) => {
    await notif.markRead(id);
    onClose();
    if (linkUrl) navigate(linkUrl);
  };

  return (
    <div className="fixed left-3 right-3 top-20 max-h-[calc(100vh-6rem)] glass-panel border border-white/10 rounded-xl shadow-neon z-[80] overflow-hidden sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(20rem,calc(100vw-1.5rem))] sm:max-h-none">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold text-white">Notifications</span>
        {notif.unreadCount > 0 && (
          <button
            onClick={() => notif.markAllRead()}
            className="min-h-10 flex items-center gap-1 text-xs text-primary hover:text-white transition-colors"
          >
            <CheckCheck size={13} />
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-[calc(100vh-10rem)] overflow-y-auto sm:max-h-96">
        {notif.loading ? (
          <div className="px-4 py-6 text-center text-gray-500 text-sm">Loading…</div>
        ) : notif.notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-gray-500">
            <Bell size={28} className="opacity-30" />
            <span className="text-sm">No notifications yet</span>
          </div>
        ) : (
          notif.notifications.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n.id, n.linkUrl)}
              className={`w-full min-h-16 text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                !n.isRead ? 'bg-primary/5' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {!n.isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                    <span className="text-xs text-primary font-mono">
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                  </div>
                  <p className="text-sm text-white font-medium line-clamp-2">{n.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                </div>
                <span className="text-[10px] text-gray-600 flex-shrink-0 mt-1">
                  {n.createdAt
                    ? new Date(n.createdAt.toDate()).toLocaleDateString()
                    : ''}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
