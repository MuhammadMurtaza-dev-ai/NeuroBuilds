import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  runTransaction,
  Timestamp,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../Firebase';
import { useAuth } from './useAuth';
import { useCountry } from '../context/CountryContext';
import { writeNotification } from './useNotifications';

export interface Thread {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  country: string;
  category: string;
  upvoteCount: number;
  upvotedBy: string[];
  downvotedBy: string[];
  replyCount: number;
  createdAt: string;
  linkedBlogId?: string;
  linkedBlogTitle?: string;
  status?: 'active' | 'hidden';
  lifecycleStatus: 'open' | 'solved' | 'closed';
  images?: string[];
}

export interface Reply {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  createdAt: string;
  images?: string[];
}

export interface CommunityFilters {
  country: string;
  category: string;
}

export const COMMUNITY_CATEGORIES = [
  { id: 'hardware', name: 'Hardware' },
  { id: 'loops', name: 'Custom Loops' },
  { id: 'software', name: 'Software' },
  { id: 'builds', name: 'Build Logs' },
  { id: 'marketplace', name: 'Marketplace' },
];

export const COMMUNITY_COUNTRIES = [
  'Pakistan', 'United States', 'United Kingdom', 'India',
  'Germany', 'Canada', 'Australia', 'UAE', 'Other',
];

export function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const THREADS = 'threads';

function toThread(id: string, data: DocumentData): Thread {
  return {
    id,
    title: data.title ?? '',
    body: data.body ?? '',
    authorId: data.authorId ?? '',
    authorName: data.authorName ?? '',
    country: data.country ?? '',
    category: data.category ?? '',
    upvoteCount: data.upvoteCount ?? 0,
    upvotedBy: data.upvotedBy ?? [],
    downvotedBy: data.downvotedBy ?? [],
    replyCount: data.replyCount ?? 0,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate().toISOString()
        : String(data.createdAt ?? ''),
    linkedBlogId: data.linkedBlogId ?? undefined,
    linkedBlogTitle: data.linkedBlogTitle ?? undefined,
    status: data.status ?? 'active',
    lifecycleStatus: data.lifecycleStatus ?? 'open',
    images: Array.isArray(data.images) ? data.images : undefined,
  };
}

function toReply(id: string, data: DocumentData): Reply {
  return {
    id,
    body: data.body ?? '',
    authorId: data.authorId ?? '',
    authorName: data.authorName ?? '',
    parentId: data.parentId ?? null,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate().toISOString()
        : String(data.createdAt ?? ''),
    images: Array.isArray(data.images) ? data.images : undefined,
  };
}

export const useCommunity = () => {
  const { user } = useAuth();
  const { selectedCountry } = useCountry();
  const [allThreads, setAllThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CommunityFilters>({
    country: selectedCountry,
    category: 'all',
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs user-editable country filter with global country context
    setFilters(prev => prev.country === selectedCountry ? prev : { ...prev, country: selectedCountry });
  }, [selectedCountry]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading reset before subscription
    setLoading(true);
     
    setError(null);

    const q = query(collection(db, THREADS), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setAllThreads(
          snap.docs.map((d) => toThread(d.id, d.data())).filter((t) => t.status !== 'hidden')
        );
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const threads = allThreads.filter((t) => {
    if (filters.country !== 'All' && t.country !== filters.country) return false;
    if (filters.category !== 'all' && t.category !== filters.category) return false;
    return true;
  });

  const createThread = async (
    title: string,
    body: string,
    category: string,
    country: string,
    linkedBlogId?: string,
    linkedBlogTitle?: string,
    images?: string[]
  ): Promise<void> => {
    if (!user) throw new Error('Must be signed in to post');
    await addDoc(collection(db, THREADS), {
      title,
      body,
      category,
      country,
      authorId: user.uid,
      authorName: user.displayName ?? user.email ?? 'Anonymous',
      upvoteCount: 0,
      upvotedBy: [],
      downvotedBy: [],
      replyCount: 0,
      createdAt: Timestamp.now(),
      status: 'active',
      lifecycleStatus: 'open',
      ...(linkedBlogId ? { linkedBlogId } : {}),
      ...(linkedBlogTitle ? { linkedBlogTitle } : {}),
      ...(images?.length ? { images } : {}),
    });
  };

  const getThreadDetails = async (threadId: string): Promise<Thread | null> => {
    const snap = await getDoc(doc(db, THREADS, threadId));
    return snap.exists() ? toThread(snap.id, snap.data()) : null;
  };

  const addReply = async (
    threadId: string,
    body: string,
    parentId: string | null = null,
    images?: string[]
  ): Promise<void> => {
    if (!user) throw new Error('Must be signed in to reply');
    const threadRef = doc(db, THREADS, threadId);
    let threadAuthorId = '';
    let threadTitle = '';

    await runTransaction(db, async (tx) => {
      const threadSnap = await tx.get(threadRef);
      if (!threadSnap.exists()) throw new Error('Thread not found');

      threadAuthorId = (threadSnap.data().authorId as string) ?? '';
      threadTitle = (threadSnap.data().title as string) ?? '';

      const newReplyRef = doc(collection(db, THREADS, threadId, 'replies'));
      tx.set(newReplyRef, {
        body,
        authorId: user.uid,
        authorName: user.displayName ?? user.email ?? 'Anonymous',
        parentId,
        createdAt: Timestamp.now(),
        ...(images?.length ? { images } : {}),
      });
      tx.update(threadRef, { replyCount: increment(1) });
    });

    if (threadAuthorId && threadAuthorId !== user.uid) {
      const replierName = user.displayName ?? user.email ?? 'Someone';
      writeNotification(threadAuthorId, {
        type: 'thread_reply',
        title: 'New reply on your thread',
        body: `${replierName} replied to your thread: "${threadTitle}"`,
        linkUrl: `/community?threadId=${threadId}`,
      }).catch(() => {});
    }
  };

  const subscribeToReplies = useCallback((
    threadId: string,
    onReplies: (replies: Reply[]) => void
  ): (() => void) => {
    const q = query(
      collection(db, THREADS, threadId, 'replies'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      onReplies(snap.docs.map((d) => toReply(d.id, d.data())));
    });
  }, []);

  const handleVote = async (
    threadId: string,
    voteType: 'upvote' | 'downvote'
  ): Promise<void> => {
    if (!user) throw new Error('Must be signed in to vote');
    const threadRef = doc(db, THREADS, threadId);
    const uid = user.uid;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(threadRef);
      if (!snap.exists()) throw new Error('Thread not found');

      const data = snap.data();
      const upvotedBy: string[] = data.upvotedBy ?? [];
      const downvotedBy: string[] = data.downvotedBy ?? [];
      const hasUpvoted = upvotedBy.includes(uid);
      const hasDownvoted = downvotedBy.includes(uid);

      if (voteType === 'upvote') {
        if (hasUpvoted) {
          tx.update(threadRef, { upvoteCount: increment(-1), upvotedBy: arrayRemove(uid) });
        } else if (hasDownvoted) {
          tx.update(threadRef, {
            upvoteCount: increment(2),
            upvotedBy: arrayUnion(uid),
            downvotedBy: arrayRemove(uid),
          });
        } else {
          tx.update(threadRef, { upvoteCount: increment(1), upvotedBy: arrayUnion(uid) });
        }
      } else {
        if (hasDownvoted) {
          tx.update(threadRef, { upvoteCount: increment(1), downvotedBy: arrayRemove(uid) });
        } else if (hasUpvoted) {
          tx.update(threadRef, {
            upvoteCount: increment(-2),
            upvotedBy: arrayRemove(uid),
            downvotedBy: arrayUnion(uid),
          });
        } else {
          tx.update(threadRef, { upvoteCount: increment(-1), downvotedBy: arrayUnion(uid) });
        }
      }
    });
  };

  const deleteThread = async (threadId: string): Promise<void> => {
    await deleteDoc(doc(db, THREADS, threadId));
  };

  const updateThread = async (
    threadId: string,
    updates: Pick<Thread, 'title' | 'body' | 'category' | 'country'>
  ): Promise<void> => {
    await updateDoc(doc(db, THREADS, threadId), updates);
  };

  const updateThreadLifecycle = async (
    threadId: string,
    status: 'solved' | 'closed'
  ): Promise<void> => {
    await updateDoc(doc(db, THREADS, threadId), { lifecycleStatus: status });
  };

  return {
    threads,
    allThreads,
    loading,
    error,
    filters,
    setFilters,
    createThread,
    getThreadDetails,
    addReply,
    subscribeToReplies,
    handleVote,
    deleteThread,
    updateThread,
    updateThreadLifecycle,
  };
};
