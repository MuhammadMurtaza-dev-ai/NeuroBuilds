import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  query,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../Firebase';
import { useAuth } from './useAuth';
import { writeNotification } from './useNotifications';

export interface BlogComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Timestamp | null;
}

function toComment(id: string, data: DocumentData): BlogComment {
  return {
    id,
    authorId: data.authorId ?? '',
    authorName: data.authorName ?? '',
    body: data.body ?? '',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
  };
}

export const useBlogComments = (postId: string) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'blogs', postId, 'comments'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setComments(snap.docs.map((d) => toComment(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [postId]);

  const addComment = async (body: string): Promise<void> => {
    if (!user) throw new Error('Must be signed in to comment');
    if (!body.trim()) throw new Error('Comment body cannot be empty');

    const postRef = doc(db, 'blogs', postId);
    const commentsRef = collection(db, 'blogs', postId, 'comments');
    let postAuthorId = '';

    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists()) throw new Error('Post not found');

      postAuthorId = (postSnap.data().authorId as string) ?? '';

      const newCommentRef = doc(commentsRef);
      tx.set(newCommentRef, {
        authorId: user.uid,
        authorName: user.displayName ?? user.email ?? 'Anonymous',
        body: body.trim(),
        createdAt: serverTimestamp(),
      });
      const current = (postSnap.data().commentCount as number) ?? 0;
      tx.update(postRef, { commentCount: current + 1 });
    });

    if (postAuthorId && postAuthorId !== user.uid) {
      writeNotification(postAuthorId, {
        type: 'blog_comment',
        title: 'New comment on your post',
        body: `${user.displayName ?? 'Someone'} commented on your blog post.`,
        linkUrl: '/blog',
      }).catch(() => {});
    }
  };

  const deleteComment = async (commentId: string): Promise<void> => {
    const postRef = doc(db, 'blogs', postId);
    const commentRef = doc(db, 'blogs', postId, 'comments', commentId);

    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists()) throw new Error('Post not found');

      tx.delete(commentRef);
      const current = (postSnap.data().commentCount as number) ?? 0;
      tx.update(postRef, { commentCount: Math.max(0, current - 1) });
    });
  };

  return { comments, loading, error, addComment, deleteComment };
};
