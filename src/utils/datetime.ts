import { Timestamp } from 'firebase/firestore';

/**
 * Compact relative time ("just now", "5m ago", "3h ago", "2d ago").
 * Accepts an ISO string or a Firestore `Timestamp` (or null/undefined → '').
 */
export function timeAgo(value: string | Timestamp | null | undefined): string {
  if (!value) return '';
  const ms = value instanceof Timestamp ? value.toMillis() : new Date(value).getTime();
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Calendar-style relative date used in listing cards
 * ("Today", "Yesterday", "3d ago", "2w ago", then "Mon D").
 */
export function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
