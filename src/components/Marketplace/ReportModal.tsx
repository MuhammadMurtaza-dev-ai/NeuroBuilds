import { useState } from 'react';
import { auth } from '../../Firebase';
import type { Listing } from '../../hooks/useStorage';
import { useReports, type ReportTargetType } from '../../hooks/useReports';
import { uploadImageToImgBB } from '../../utils/imageUploader';
import CyberSelect from '../CyberSelect';

interface Props {
  listing: Listing;
  onClose: () => void;
}

const REASONS = [
  'Scam or fraudulent listing',
  'Counterfeit or misrepresented item',
  'Dishonest or abusive seller',
  'Prohibited or illegal item',
  'Spam or duplicate listing',
  'Other',
];

export default function ReportModal({ listing, onClose }: Props) {
  const { createReport } = useReports();
  const [target, setTarget] = useState<Exclude<ReportTargetType, 'thread'>>('listing');
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    const reporter = auth.currentUser;
    if (!reporter) { setError('You must be signed in to report.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      let proofUrl: string | undefined;
      if (proofFile) {
        proofUrl = await uploadImageToImgBB(proofFile);
      }
      const fullReason = details.trim() ? `${reason} — ${details.trim()}` : reason;
      await createReport({
        reporterId: reporter.uid,
        reporterName: reporter.displayName ?? reporter.email ?? 'Anonymous',
        reason: fullReason,
        targetId: target === 'listing' ? listing.id : listing.sellerId,
        targetType: target,
        targetTitle: target === 'listing' ? listing.title : listing.sellerName,
        proofUrl,
      });
      if (proofPreview) URL.revokeObjectURL(proofPreview);
      setDone(true);
      setTimeout(onClose, 1400);
    } catch {
      setError('Failed to submit report. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-[2rem] border border-white/10 w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-7 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-red-400 leading-none">flag</span>
            </div>
            <h2 className="font-bold text-xl leading-tight">Report</h2>
          </div>
          <button onClick={onClose} className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0" aria-label="Close report modal">
            <span className="material-symbols-outlined text-base leading-none">close</span>
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="material-symbols-outlined text-5xl text-emerald-400">check_circle</span>
            <p className="text-sm text-gray-300">Report submitted. Our moderators will review it.</p>
          </div>
        ) : (
          <>
            {/* Target selector */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">What are you reporting?</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => setTarget('listing')}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${target === 'listing' ? 'bg-primary text-bg-dark' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                >
                  This Listing
                </button>
                <button
                  onClick={() => setTarget('user')}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${target === 'user' ? 'bg-primary text-bg-dark' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                >
                  This Seller
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1.5">
                {target === 'listing'
                  ? `Reporting listing: "${listing.title}"`
                  : `Reporting seller: ${listing.sellerName}`}
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Reason</label>
              <CyberSelect
                value={reason}
                onChange={setReason}
                options={REASONS.map(r => ({ value: r, label: r }))}
                className="w-full"
              />
            </div>

            {/* Details */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Details <span className="text-gray-600">(optional but helps moderators)</span></label>
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                rows={3}
                placeholder="Describe what happened. Provide proof where possible."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none resize-none"
              />
            </div>

            {/* Proof upload */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Proof <span className="text-gray-600">(optional screenshot)</span></label>
              {proofPreview ? (
                <div className="relative w-24 h-20 rounded-xl overflow-hidden border border-white/10">
                  <img src={proofPreview} alt="proof" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { if (proofPreview) URL.revokeObjectURL(proofPreview); setProofFile(null); setProofPreview(null); }}
                    className="absolute inset-0 bg-black/70 opacity-0 hover:opacity-100 focus:opacity-100 flex items-center justify-center transition-opacity"
                    aria-label="Remove proof"
                  >
                    <span className="material-symbols-outlined text-white text-sm">close</span>
                  </button>
                </div>
              ) : (
                <label className="w-24 h-20 rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer">
                  <span className="material-symbols-outlined text-gray-400 text-xl leading-none">add_photo_alternate</span>
                  <span className="text-gray-500 text-[10px]">Add proof</span>
                  <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
                </label>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-base leading-none">error</span>
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition-colors text-sm font-medium disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-red-500/90 text-white font-bold text-sm hover:bg-red-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><span className="material-symbols-outlined text-base leading-none animate-spin">progress_activity</span>Submitting...</>
                ) : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
