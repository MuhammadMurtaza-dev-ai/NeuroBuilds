import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import type { UseNotificationsResult } from '../../hooks/useNotifications';
import { NotificationDrawer } from './NotificationDrawer';

interface Props {
  notif: UseNotificationsResult;
}

export function NotificationBell({ notif }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 text-gray-400 hover:text-primary transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {notif.unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-accent-purple text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {notif.unreadCount > 99 ? '99+' : notif.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationDrawer
          notif={notif}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
