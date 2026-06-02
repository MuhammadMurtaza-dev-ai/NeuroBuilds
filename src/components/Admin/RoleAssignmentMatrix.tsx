import { useState } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../../Firebase';
import { Shield, Search, ChevronDown } from 'lucide-react';
import type { UserRole } from '../../hooks/useUserRole';

const AI_SERVICE =
  (import.meta.env.VITE_AI_SERVICE_URL as string | undefined) ?? 'http://localhost:8000';

const ROLES: UserRole[] = ['user', 'vendor', 'moderator', 'admin'];

const ROLE_COLOURS: Record<UserRole, string> = {
  user: 'text-gray-400 border-gray-600',
  vendor: 'text-blue-400 border-blue-600',
  moderator: 'text-yellow-400 border-yellow-600',
  admin: 'text-accent-purple border-accent-purple',
};

interface UserRow {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
}

export function RoleAssignmentMatrix() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('displayName', 'asc')));
      const rows: UserRow[] = snap.docs.map(d => ({
        uid: d.id,
        displayName: (d.data().displayName as string) ?? d.id,
        email: (d.data().email as string) ?? '',
        role: ((d.data().role as UserRole) ?? 'user'),
      }));
      setUsers(rows);
      setSearched(true);
    } catch {
      setFeedback('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const assignRole = async (uid: string, newRole: UserRole) => {
    setSaving(uid);
    setFeedback(null);

    const current = auth.currentUser;
    if (!current) {
      setFeedback('Your session expired. Please sign in again.');
      setSaving(null);
      return;
    }

    try {
      // Role assignment is a privileged server operation: the backend sets the
      // Firestore role AND the Firebase JWT custom claim (and revokes the
      // target's refresh tokens). The client cannot set the claim itself, and
      // firestore.rules blocks a direct write to the `role` field anyway.
      const idToken = await current.getIdToken();
      const resp = await fetch(`${AI_SERVICE}/api/admin/users/${uid}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ role: newRole }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as { detail?: string };
        throw new Error(data.detail ?? `Server error ${resp.status}`);
      }

      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role: newRole } : u));
      setFeedback(
        newRole === 'admin'
          ? 'Role updated. The user must sign out and back in for admin access to activate.'
          : 'Role updated. The user must refresh their session for the change to take effect.'
      );
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        setFeedback('Request timed out. Is the AI backend running?');
      } else {
        setFeedback(err instanceof Error ? err.message : 'Failed to update role.');
      }
    } finally {
      setSaving(null);
    }
  };

  const filtered = search.trim()
    ? users.filter(u =>
        u.displayName.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Shield size={18} className="text-accent-purple" />
        <h3 className="text-white font-semibold">Role Assignment Matrix</h3>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by name or email…"
            className="w-full pl-9 pr-4 py-2 bg-bg-panel border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={loadUsers}
          disabled={loading}
          className="px-4 py-2 bg-primary/10 border border-primary/30 text-primary rounded-lg text-sm hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : searched ? 'Refresh' : 'Load Users'}
        </button>
      </div>

      {feedback && (
        <p className="text-xs text-primary font-mono">{feedback}</p>
      )}

      {searched && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="pb-2 text-gray-400 font-normal">User</th>
                <th className="pb-2 text-gray-400 font-normal">Email</th>
                <th className="pb-2 text-gray-400 font-normal">Role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-gray-600 text-xs">
                    No users found
                  </td>
                </tr>
              ) : (
                filtered.map(u => (
                  <tr key={u.uid} className="border-b border-white/5 hover:bg-white/2">
                    <td className="py-2.5 pr-4 text-white font-mono text-xs">{u.displayName}</td>
                    <td className="py-2.5 pr-4 text-gray-400 text-xs">{u.email}</td>
                    <td className="py-2.5">
                      <div className="relative inline-block">
                        <select
                          value={u.role}
                          disabled={saving === u.uid}
                          onChange={e => assignRole(u.uid, e.target.value as UserRole)}
                          className={`appearance-none pr-7 pl-2.5 py-1 bg-bg-dark border rounded-md text-xs font-mono cursor-pointer focus:outline-none focus:border-primary disabled:opacity-50 ${ROLE_COLOURS[u.role]}`}
                        >
                          {ROLES.map(r => (
                            <option key={r} value={r} className="text-white bg-bg-dark">
                              {r}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={11}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
