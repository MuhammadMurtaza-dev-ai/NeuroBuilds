import { useEffect, useState } from 'react';
import {
  doc,
  onSnapshot,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../Firebase';
import { writeAuditLog } from '../../utils/auditLog';

interface Props {
  uid: string;
  displayName: string;
}

/**
 * Shown at the top of the dashboard when the signed-in user's marketplace
 * account has been disabled by a moderator. Surfaces the reason and lets the
 * user file a single appeal contesting the decision.
 */
export default function AccountStatusBanner({ uid, displayName }: Props) {
  const [disabled, setDisabled] = useState(false);
  const [reason, setReason] = useState('');
  const [appealStatus, setAppealStatus] = useState<'none' | 'open' | 'resolved'>('none');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        setDisabled(snap.data()?.accountStatus === 'disabled');
        setReason(typeof snap.data()?.disabledReason === 'string' ? snap.data()!.disabledReason : '');
      },
      () => setDisabled(false),
    );
    return unsub;
  }, [uid]);

  // Has the user already filed an appeal?
  useEffect(() => {
    const q = query(
      collection(db, 'appeals'),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(1),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        if (snap.empty) { setAppealStatus('none'); return; }
        setAppealStatus(snap.docs[0].data().status === 'resolved' ? 'resolved' : 'open');
      },
      () => setAppealStatus('none'),
    );
    return unsub;
  }, [uid]);

  if (!disabled) return null;

  const handleSubmit = async () => {
    if (!message.trim() || auth.currentUser?.uid !== uid) return;
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, 'appeals'), {
        uid,
        displayName,
        message: message.trim(),
        status: 'open',
        createdAt: serverTimestamp(),
      });
      writeAuditLog(uid, 'appeal.create', { targetId: uid, targetType: 'user' });
      setMessage('');
    } catch {
      setError('Failed to submit appeal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-8 glass-panel rounded-bento border border-red-500/30 bg-red-500/5 p-6">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-red-400 text-2xl shrink-0">block</span>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-red-400 text-lg">Your marketplace account is disabled</h2>
          <p className="text-gray-300 text-sm mt-1">
            A moderator has disabled your marketplace account, so your listings are hidden and you
            cannot post new ones.
          </p>
          {reason && (
            <p className="text-sm mt-2 text-gray-400">
              <span className="text-gray-500">Reason: </span>{reason}
            </p>
          )}

          {appealStatus === 'open' ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-base leading-none">hourglass_top</span>
              Your appeal has been submitted and is under review.
            </div>
          ) : appealStatus === 'resolved' ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-300 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-base leading-none">gavel</span>
              Your appeal has been reviewed by an administrator.
            </div>
          ) : (
            <div className="mt-4">
              <label className="text-sm text-gray-400 mb-2 block">Appeal this decision</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                placeholder="Explain why this action should be reconsidered. Provide any evidence or context."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none resize-none"
              />
              {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
              <button
                onClick={handleSubmit}
                disabled={submitting || !message.trim()}
                className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-bg-dark font-bold text-sm hover:bg-cyan-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <><span className="material-symbols-outlined text-base leading-none animate-spin">progress_activity</span>Submitting...</>
                ) : (
                  <><span className="material-symbols-outlined text-base leading-none">send</span>Submit Appeal</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
