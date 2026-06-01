import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../Firebase';

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  targetId: string;
  targetType: 'listing' | 'thread';
  targetTitle: string;
  status: 'open' | 'resolved';
  createdAt: Timestamp | null;
}

function toReport(id: string, data: DocumentData): Report {
  return {
    id,
    reporterId: data.reporterId ?? '',
    reporterName: data.reporterName ?? '',
    reason: data.reason ?? '',
    targetId: data.targetId ?? '',
    targetType: data.targetType ?? 'listing',
    targetTitle: data.targetTitle ?? '',
    status: data.status ?? 'open',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
  };
}

const REPORTS = 'reports';

export const useReports = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, REPORTS), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setReports(snap.docs.map((d) => toReport(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const createReport = async (
    data: Omit<Report, 'id' | 'status' | 'createdAt'>
  ): Promise<void> => {
    await addDoc(collection(db, REPORTS), {
      ...data,
      status: 'open',
      createdAt: serverTimestamp(),
    });
  };

  const resolveReport = async (reportId: string): Promise<void> => {
    await updateDoc(doc(db, REPORTS, reportId), { status: 'resolved' });
  };

  const hideTarget = async (
    targetId: string,
    targetType: 'listing' | 'thread'
  ): Promise<void> => {
    const collectionName = targetType === 'listing' ? 'listings' : 'threads';
    await updateDoc(doc(db, collectionName, targetId), { status: 'hidden' });
  };

  return { reports, loading, error, createReport, resolveReport, hideTarget };
};
