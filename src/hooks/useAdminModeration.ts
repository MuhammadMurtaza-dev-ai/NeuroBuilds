import { useCallback } from 'react';
import { auth } from '../Firebase';
import { writeAuditLog } from '../utils/auditLog';

const AI_SERVICE = (import.meta.env.VITE_AI_SERVICE_URL as string | undefined) ?? 'http://localhost:8000';

/**
 * Admin-only account moderation. Disabling/enabling an account is a privileged
 * operation that must touch a server-only Firestore field (accountStatus), so
 * it goes through the require_admin-guarded FastAPI endpoint rather than a
 * direct client write — mirroring the role-assignment flow.
 */
export function useAdminModeration() {
  const setAccountStatus = useCallback(
    async (uid: string, accountStatus: 'active' | 'disabled', reason?: string): Promise<void> => {
      const admin = auth.currentUser;
      if (!admin) throw new Error('Not authenticated');
      const idToken = await admin.getIdToken();

      const res = await fetch(`${AI_SERVICE}/api/admin/users/${uid}/account-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ status: accountStatus, reason: reason ?? null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(data.detail ?? `Server error ${res.status}`);
      }

      writeAuditLog(
        admin.uid,
        accountStatus === 'disabled' ? 'moderation.disable_account' : 'moderation.enable_account',
        { targetId: uid, targetType: 'user' },
      );
    },
    [],
  );

  return { setAccountStatus };
}
