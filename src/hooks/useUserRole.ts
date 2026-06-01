import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../Firebase';

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

  useEffect(() => {
    if (!uid) {
      setResult({ ...DEFAULT });
      return;
    }
    setResult(prev => ({ ...prev, loading: true }));
    getDoc(doc(db, 'users', uid))
      .then(snap => {
        const role = ((snap.exists() ? snap.data().role : undefined) ?? 'user') as UserRole;
        setResult({
          role,
          isAdmin: role === 'admin',
          isModerator: role === 'moderator' || role === 'admin',
          isVendor: role === 'vendor',
          loading: false,
        });
      })
      .catch(() => setResult({ ...DEFAULT }));
  }, [uid]);

  return result;
}
