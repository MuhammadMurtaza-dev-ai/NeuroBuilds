import { doc, getDoc } from 'firebase/firestore';
import { db } from '../Firebase';

export async function resolveUsernameToUid(username: string): Promise<string | null> {
  const normalized = username.toLowerCase().replace(/^@/, '');
  const snap = await getDoc(doc(db, 'usernames', normalized));
  if (!snap.exists()) return null;
  return (snap.data().uid as string) ?? null;
}

export async function getUserProfile(
  uid: string
): Promise<{ displayName: string; username?: string } | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    displayName: (data.displayName as string) ?? '',
    username: (data.username as string) ?? undefined,
  };
}
