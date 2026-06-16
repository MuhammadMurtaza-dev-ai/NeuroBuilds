import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../Firebase';

export interface AppNotification {
  id: string;
  type: 'blog_comment' | 'thread_reply' | 'marketplace_message' | 'ai_build_ready';
  title: string;
  body: string;
  isRead: boolean;
  linkUrl?: string;
  createdAt: Timestamp | null;
}

function toNotification(id: string, data: DocumentData): AppNotification {
  return {
    id,
    type: data.type ?? 'marketplace_message',
    title: data.title ?? '',
    body: data.body ?? '',
    isRead: data.isRead ?? false,
    linkUrl: data.linkUrl ?? undefined,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
  };
}

export interface UseNotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  loading: boolean;
}

export function useNotifications(uid?: string | null): UseNotificationsResult {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear notifications on logout
      setNotifications([]);
      return;
    }
     
    setLoading(true);
    const q = query(
      collection(db, 'users', uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setNotifications(snap.docs.map(d => toNotification(d.id, d.data())));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [uid]);

  const markRead = async (id: string) => {
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid, 'notifications', id), { isRead: true });
  };

  const markAllRead = async () => {
    if (!uid) return;
    const unread = notifications.filter(n => !n.isRead);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach(n => {
      batch.update(doc(db, 'users', uid, 'notifications', n.id), { isRead: true });
    });
    await batch.commit();
  };

  return {
    notifications,
    unreadCount: notifications.filter(n => !n.isRead).length,
    markRead,
    markAllRead,
    loading,
  };
}

/**
 * Standalone helper — write a notification into another user's subcollection.
 * Fire-and-forget: always call as `writeNotification(...).catch(() => {})` so
 * notification failures never surface to the user.
 */
export async function writeNotification(
  targetUid: string,
  payload: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'>
): Promise<void> {
  await addDoc(collection(db, 'users', targetUid, 'notifications'), {
    ...payload,
    isRead: false,
    createdAt: serverTimestamp(),
  });
}
