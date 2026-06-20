import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../Firebase';

export interface Appeal {
  id: string;
  uid: string;
  displayName: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: Timestamp | null;
}

function toAppeal(id: string, data: DocumentData): Appeal {
  return {
    id,
    uid: data.uid ?? '',
    displayName: data.displayName ?? '',
    message: data.message ?? '',
    status: data.status ?? 'open',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
  };
}

/** Admin-only: live feed of moderation appeals (read gated to admins by rules). */
export function useAppeals() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading reset before subscription
    setLoading(true);
    const q = query(collection(db, 'appeals'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      snap => {
        setAppeals(snap.docs.map(d => toAppeal(d.id, d.data())));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const resolveAppeal = async (id: string): Promise<void> => {
    await updateDoc(doc(db, 'appeals', id), { status: 'resolved' });
  };

  return { appeals, loading, resolveAppeal };
}
