import { useState } from 'react';
import { X, Plus, Trash2, Users } from 'lucide-react';
import { resolveUsernameToUid, getUserProfile } from '../../utils/userLookup';

interface Props {
  currentUid: string;
  onCreate: (participantUids: string[], groupName: string) => Promise<void>;
  onClose: () => void;
}

interface ResolvedUser {
  uid: string;
  displayName: string;
  username?: string;
}

export function CreateGroupModal({ currentUid, onCreate, onClose }: Props) {
  const [groupName, setGroupName] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [members, setMembers] = useState<ResolvedUser[]>([]);
  const [lookupError, setLookupError] = useState('');
  const [looking, setLooking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const addMember = async () => {
    const raw = usernameInput.trim();
    if (!raw) return;
    setLookupError('');
    setLooking(true);
    try {
      const uid = await resolveUsernameToUid(raw);
      if (!uid) { setLookupError('User not found.'); return; }
      if (uid === currentUid) { setLookupError('You are already in the group.'); return; }
      if (members.some(m => m.uid === uid)) { setLookupError('Already added.'); return; }
      const profile = await getUserProfile(uid);
      setMembers(prev => [...prev, {
        uid,
        displayName: profile?.displayName ?? raw,
        username: profile?.username,
      }]);
      setUsernameInput('');
    } catch {
      setLookupError('Failed to look up user.');
    } finally {
      setLooking(false);
    }
  };

  const removeMember = (uid: string) => setMembers(prev => prev.filter(m => m.uid !== uid));

  const handleCreate = async () => {
    if (!groupName.trim()) { setError('Group name is required.'); return; }
    if (members.length < 1) { setError('Add at least one other member.'); return; }
    setError('');
    setCreating(true);
    try {
      await onCreate(members.map(m => m.uid), groupName.trim());
      onClose();
    } catch {
      setError('Failed to create group. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-panel border border-white/10 rounded-2xl w-full max-w-md shadow-neon">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <span className="text-white font-semibold text-sm">Create Group Chat</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-mono">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="e.g. PC Build Gang"
              maxLength={60}
              className="w-full px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-mono">Add Members by @username</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMember()}
                placeholder="@username"
                className="flex-1 px-3 py-2 bg-bg-dark border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
              />
              <button
                onClick={addMember}
                disabled={looking || !usernameInput.trim()}
                className="px-3 py-2 bg-primary/10 border border-primary/30 text-primary rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                <Plus size={16} />
              </button>
            </div>
            {lookupError && <p className="text-xs text-red-400 mt-1">{lookupError}</p>}
          </div>

          {members.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400 font-mono">Members ({members.length})</p>
              {members.map(m => (
                <div
                  key={m.uid}
                  className="flex items-center justify-between px-3 py-2 bg-bg-dark border border-white/5 rounded-lg"
                >
                  <div>
                    <span className="text-sm text-white">{m.displayName}</span>
                    {m.username && (
                      <span className="ml-2 text-xs text-primary font-mono">@{m.username}</span>
                    )}
                  </div>
                  <button
                    onClick={() => removeMember(m.uid)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-2.5 bg-primary/10 border border-primary/30 text-primary rounded-xl hover:bg-primary/20 transition-colors text-sm font-mono disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}
