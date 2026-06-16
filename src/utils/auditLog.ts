import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../Firebase';

/**
 * Append-only audit trail for sensitive marketplace and moderation actions
 * (SRS §2.2.4 "Audit functions"; Activity Fig.15 / Sequence Fig.19).
 *
 * Entries are written to the `audit_logs` collection, which firestore.rules
 * makes immutable: any signed-in user may append an entry attributed to
 * themselves, only admins may read it, and nobody may edit or delete one.
 *
 * Writes are fire-and-forget — a logging failure must never block or fail the
 * user action it records, so callers should not await this.
 */
export type AuditAction =
  | 'listing.create'
  | 'listing.update'
  | 'listing.delete'
  | 'moderation.hide_target'
  | 'moderation.resolve_report';

export interface AuditMeta {
  targetId?: string;
  targetType?: string;
  [key: string]: string | number | boolean | undefined;
}

export function writeAuditLog(
  actorId: string,
  action: AuditAction,
  meta: AuditMeta = {},
): void {
  if (!actorId) return;
  // Strip undefined values — Firestore rejects them.
  const cleanMeta: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined) cleanMeta[k] = v;
  }
  addDoc(collection(db, 'audit_logs'), {
    actorId,
    action,
    ...cleanMeta,
    createdAt: serverTimestamp(),
  }).catch(() => {
    // Never surface audit-log failures to the user; the action itself succeeded.
  });
}
