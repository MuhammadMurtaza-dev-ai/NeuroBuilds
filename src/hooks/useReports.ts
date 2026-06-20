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
import { db, auth } from '../Firebase';
import { writeAuditLog } from '../utils/auditLog';

export type ReportTargetType = 'listing' | 'thread' | 'user';

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  targetId: string;
  targetType: ReportTargetType;
  targetTitle: string;
  /** Optional ImgBB URL of proof uploaded by the reporter. */
  proofUrl?: string;
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
    proofUrl: typeof data.proofUrl === 'string' && data.proofUrl ? data.proofUrl : undefined,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading reset before subscription
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
    // Strip undefined (e.g. omitted proofUrl) — Firestore rejects undefined values.
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    );
    await addDoc(collection(db, REPORTS), {
      ...clean,
      status: 'open',
      createdAt: serverTimestamp(),
    });
    writeAuditLog(auth.currentUser?.uid ?? '', 'report.create', {
      targetId: data.targetId,
      targetType: data.targetType,
    });
  };

  const resolveReport = async (reportId: string): Promise<void> => {
    await updateDoc(doc(db, REPORTS, reportId), { status: 'resolved' });
    writeAuditLog(auth.currentUser?.uid ?? '', 'moderation.resolve_report', {
      targetId: reportId,
      targetType: 'report',
    });
  };

  const hideTarget = async (
    targetId: string,
    targetType: 'listing' | 'thread'
  ): Promise<void> => {
    const collectionName = targetType === 'listing' ? 'listings' : 'threads';
    await updateDoc(doc(db, collectionName, targetId), { status: 'hidden' });
    writeAuditLog(auth.currentUser?.uid ?? '', 'moderation.hide_target', {
      targetId,
      targetType,
    });
  };

  return { reports, loading, error, createReport, resolveReport, hideTarget };
};
