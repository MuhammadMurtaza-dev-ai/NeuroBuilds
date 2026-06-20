import { useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../Firebase';

export type UserRole = 'user' | 'vendor' | 'moderator' | 'admin';

export interface UserRoleResult {
  role: UserRole;
  isAdmin: boolean;
  isModerator: boolean;
  isVendor: boolean;
  loading: boolean;
}

const DEFAULT: UserRoleResult = {
  role: 'user',
  isAdmin: false,
  isModerator: false,
  isVendor: false,
  loading: false,
};

export function useUserRole(uid?: string | null): UserRoleResult {
  const [result, setResult] = useState<UserRoleResult>({ ...DEFAULT, loading: !!uid });
  // Tracks the uid whose Firestore fetch has fully settled so we can detect
  // the gap between uid arriving and the effect running.
  const settledUidRef = useRef<string | null | undefined>(uid);

  useEffect(() => {
    if (!uid) {
      settledUidRef.current = uid;
      setResult({ ...DEFAULT });
      return;
    }
    // isAdmin must mirror the *actual* capability enforced by firestore.rules,
    // which is the cryptographic JWT custom claim — NOT the Firestore role
    // field. A user whose users/{uid}.role == 'admin' but who lacks the claim
    // is a "ghost admin": the panel would load but every privileged write would
    // be permission-denied. So we read the claim from the current user's token
    // and treat it as the source of truth for admin access. The Firestore role
    // still drives role display + isModerator/isVendor (those rules use a doc
    // read, not a claim).
    const current = auth.currentUser;
    const claimPromise: Promise<boolean> =
      current && current.uid === uid
        ? current.getIdTokenResult().then(r => r.claims.admin === true).catch(() => false)
        : Promise.resolve(false);

    Promise.all([getDoc(doc(db, 'users', uid)), claimPromise])
      .then(([snap, hasAdminClaim]) => {
        const role = ((snap.exists() ? snap.data().role : undefined) ?? 'user') as UserRole;
        // Fall back to the Firestore role only when we couldn't inspect the
        // token (e.g. a lookup for a uid other than the signed-in user).
        const canCheckClaim = !!current && current.uid === uid;
        const isAdmin = canCheckClaim ? hasAdminClaim : role === 'admin';
        settledUidRef.current = uid;
        setResult({
          role,
          isAdmin,
          isModerator: role === 'moderator' || role === 'admin',
          isVendor: role === 'vendor',
          loading: false,
        });
      })
      .catch(() => {
        settledUidRef.current = uid;
        setResult({ ...DEFAULT });
      });
  }, [uid]);

  // If uid has changed but the Firestore fetch hasn't settled yet, return
  // loading=true immediately so the AdminProtectedRoute doesn't see a brief
  // isAdmin=false flash and redirect before the role is known.
  // eslint-disable-next-line react-hooks/refs -- intentional ghost-admin flash prevention
  if (uid !== settledUidRef.current) {
    return { ...DEFAULT, loading: true };
  }

  return result;
}
