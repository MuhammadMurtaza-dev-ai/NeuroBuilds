import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../Firebase';

const USERNAME_REGEX = /^[a-z0-9][a-z0-9.]{1,18}[a-z0-9]$/;

export function isValidUsernameFormat(raw: string): boolean {
  if (!USERNAME_REGEX.test(raw)) return false;
  if (raw.includes('..')) return false;
  return true;
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'usernames', username.toLowerCase()));
  return !snap.exists();
}

/**
 * Atomically claims a new username via writeBatch:
 *   1. Creates usernames/{newUsername} = { uid }
 *   2. Updates users/{uid}.username = newUsername
 *   3. Deletes usernames/{oldUsername} if provided and different
 *
 * Caller must run checkUsernameAvailable BEFORE calling this — the batch does
 * not contain a conditional read so concurrent duplicate claims are possible
 * within a narrow window. For a FYP this is acceptable; replace with
 * runTransaction for strict conflict prevention if needed.
 */
export async function claimUsername(
  newUsername: string,
  oldUsername: string | null,
  uid: string
): Promise<void> {
  const normalized = newUsername.toLowerCase();
  const batch = writeBatch(db);

  batch.set(doc(db, 'usernames', normalized), { uid });
  batch.update(doc(db, 'users', uid), { username: normalized });

  if (oldUsername && oldUsername.toLowerCase() !== normalized) {
    batch.delete(doc(db, 'usernames', oldUsername.toLowerCase()));
  }

  await batch.commit();
}
