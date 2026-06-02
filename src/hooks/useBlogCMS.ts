import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../Firebase';

export type BlogStatus = 'draft' | 'pending_review' | 'scheduled' | 'published';
export type AuthorType = 'user' | 'ai_agent';

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  thumbnailUrl: string;
  category: 'Tutorial' | 'Hardware' | 'Industry';
  content: string;
  authorId: string;
  authorName: string;
  isPublished: boolean;
  status: BlogStatus;
  publishAt?: Timestamp | null;
  authorType: AuthorType;
  videoUrl?: string;
  commentCount: number;
  rejectionNote?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type BlogPostInput = Omit<
  BlogPost,
  'id' | 'createdAt' | 'updatedAt' | 'excerpt' | 'commentCount' | 'rejectionNote'
>;

const BLOGS_COLLECTION = 'blogs';

const deriveExcerpt = (content: string): string =>
  content.replace(/[#*_`>[\]]/g, '').slice(0, 160).trimEnd() + (content.length > 160 ? '…' : '');

export const useBlogCMS = () => {
  const createBlogPost = async (postData: BlogPostInput): Promise<string> => {
    if (postData.authorType === 'ai_agent') {
      const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
      const guardQuery = query(
        collection(db, BLOGS_COLLECTION),
        where('authorType', '==', 'ai_agent'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snap = await getDocs(guardQuery);
      if (!snap.empty) {
        const lastCreatedAt = snap.docs[0].data().createdAt as Timestamp | null;
        if (lastCreatedAt) {
          const deltaMs = Date.now() - lastCreatedAt.toMillis();
          if (deltaMs < TWELVE_HOURS_MS) {
            const hoursRemaining = ((TWELVE_HOURS_MS - deltaMs) / (60 * 60 * 1000)).toFixed(1);
            throw new Error(
              `Anti-spam governor: AI agent posted ${(deltaMs / (60 * 60 * 1000)).toFixed(1)}h ago. ` +
              `Next post allowed in ${hoursRemaining}h (12-hour cooldown).`
            );
          }
        }
      }
    }

    const docRef = await addDoc(collection(db, BLOGS_COLLECTION), {
      ...postData,
      excerpt: deriveExcerpt(postData.content),
      isPublished: postData.status === 'published',
      commentCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  };

  const updateBlogPost = async (
    id: string,
    updates: Partial<Omit<BlogPost, 'id' | 'createdAt'>>
  ): Promise<void> => {
    const payload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };
    if (updates.content) {
      payload.excerpt = deriveExcerpt(updates.content);
    }
    if (updates.status !== undefined) {
      payload.isPublished = updates.status === 'published';
    }
    await updateDoc(doc(db, BLOGS_COLLECTION, id), payload);
  };

  const deleteBlogPost = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, BLOGS_COLLECTION, id));
  };

  const approvePost = async (id: string, publishAt?: Timestamp): Promise<void> => {
    const now = Timestamp.now();
    const isScheduled = publishAt && publishAt.toMillis() > now.toMillis();
    await updateDoc(doc(db, BLOGS_COLLECTION, id), {
      status: isScheduled ? 'scheduled' : 'published',
      isPublished: !isScheduled,
      ...(publishAt ? { publishAt } : {}),
      updatedAt: serverTimestamp(),
    });
  };

  const rejectPost = async (id: string, note: string): Promise<void> => {
    await updateDoc(doc(db, BLOGS_COLLECTION, id), {
      status: 'draft',
      isPublished: false,
      rejectionNote: note,
      updatedAt: serverTimestamp(),
    });
  };

  const schedulePost = async (id: string, publishAt: Timestamp): Promise<void> => {
    await updateDoc(doc(db, BLOGS_COLLECTION, id), {
      status: 'scheduled',
      isPublished: false,
      publishAt,
      updatedAt: serverTimestamp(),
    });
  };

  return { createBlogPost, updateBlogPost, deleteBlogPost, approvePost, rejectPost, schedulePost };
};

export const useBlogFeed = (isAdmin: boolean) => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    const ref = collection(db, BLOGS_COLLECTION);
    const q = isAdmin
      ? query(ref, orderBy('createdAt', 'desc'))
      : query(ref, where('isPublished', '==', true), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched: BlogPost[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title ?? '',
            excerpt: data.excerpt ?? '',
            thumbnailUrl: data.thumbnailUrl ?? '',
            category: data.category ?? 'Hardware',
            content: data.content ?? '',
            authorId: data.authorId ?? '',
            authorName: data.authorName ?? '',
            isPublished: data.isPublished ?? false,
            status: data.status ?? (data.isPublished ? 'published' : 'draft'),
            publishAt: data.publishAt ?? null,
            authorType: data.authorType ?? 'user',
            videoUrl: data.videoUrl ?? undefined,
            commentCount: data.commentCount ?? 0,
            rejectionNote: data.rejectionNote ?? undefined,
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          } as BlogPost;
        });
        setPosts(fetched);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  return { posts, loading, error };
};

// Dedicated real-time stream for the admin review queue.
// Queries only 'pending_review' and 'scheduled' documents server-side,
// so the snapshot immediately drops a post the moment it is approved/rejected.
export const useReviewQueue = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, BLOGS_COLLECTION),
      where('status', 'in', ['pending_review', 'scheduled'])
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const fetched: BlogPost[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title ?? '',
              excerpt: data.excerpt ?? '',
              thumbnailUrl: data.thumbnailUrl ?? '',
              category: data.category ?? 'Hardware',
              content: data.content ?? '',
              authorId: data.authorId ?? '',
              authorName: data.authorName ?? '',
              isPublished: data.isPublished ?? false,
              status: data.status ?? 'draft',
              publishAt: data.publishAt ?? null,
              authorType: data.authorType ?? 'user',
              videoUrl: data.videoUrl ?? undefined,
              commentCount: data.commentCount ?? 0,
              rejectionNote: data.rejectionNote ?? undefined,
              createdAt: data.createdAt ?? null,
              updatedAt: data.updatedAt ?? null,
            } as BlogPost;
          })
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setPosts(fetched);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, []);

  return { posts, loading };
};

export const useAdminRole = (uid: string | null): { isAdmin: boolean; loading: boolean } => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Mirror firestore.rules isAdmin(): the authoritative signal is the JWT
    // custom claim, not the Firestore role field. Reading the claim avoids
    // "ghost admins" who can open admin UI but fail every privileged write.
    const current = auth.currentUser;
    if (current && current.uid === uid) {
      current.getIdTokenResult()
        .then((r) => { setIsAdmin(r.claims.admin === true); })
        .catch(() => { setIsAdmin(false); })
        .finally(() => setLoading(false));
    } else {
      // Can't inspect another user's token — fall back to the Firestore role.
      getDoc(doc(db, 'users', uid)).then((snap) => {
        setIsAdmin(snap.exists() && (snap.data() as { role?: string }).role === 'admin');
        setLoading(false);
      }).catch(() => {
        setIsAdmin(false);
        setLoading(false);
      });
    }
  }, [uid]);

  return { isAdmin, loading };
};
