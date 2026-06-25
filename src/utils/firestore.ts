import { Timestamp } from 'firebase/firestore';

/**
 * Normalise a Firestore field to an ISO date string.
 * Accepts a `Timestamp`, an already-stringified date, or null/undefined.
 * Replaces the `x instanceof Timestamp ? x.toDate().toISOString() : String(x ?? '')`
 * pattern that was duplicated across the doc converters.
 */
export const tsToISO = (v: unknown): string =>
  v instanceof Timestamp ? v.toDate().toISOString() : String(v ?? '');
