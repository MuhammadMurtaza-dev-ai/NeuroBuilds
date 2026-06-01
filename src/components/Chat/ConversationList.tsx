import { useState, useRef } from 'react';
import { Users, MessageSquarePlus, Loader, Search } from 'lucide-react';
import type { Conversation } from '../../hooks/useChats';
import { resolveUsernameToUid } from '../../utils/userLookup';

interface Props {
  conversations: Conversation[];
  activeConversationId: string | null;
  currentUserId: string;
  loading: boolean;
  onSelectConversation: (id: string) => void;
  onStartDM: (targetUid: string) => Promise<void>;
  onCreateGroup: () => void;
}

export default function ConversationList({
  conversations,
  activeConversationId,
  loading,
  onSelectConversation,
  onStartDM,
  onCreateGroup,
}: Props) {
  const [dmInput, setDmInput] = useState('');
  const [dmLoading, setDmLoading] = useState(false);
  const [dmError, setDmError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDM = async () => {
    const raw = dmInput.trim();
    if (!raw) return;
    setDmError('');
    setDmLoading(true);
    try {
      const uid = await resolveUsernameToUid(raw);
      if (!uid) { setDmError('User not found.'); return; }
      await onStartDM(uid);
      setDmInput('');
    } catch {
      setDmError('Failed to start DM.');
    } finally {
      setDmLoading(false);
    }
  };

  const getConvLabel = (conv: Conversation) => {
    if (conv.type === 'group') return conv.groupName ?? 'Group Chat';
    if (conv.listingTitle) return conv.listingTitle;
    return 'Direct Message';
  };

  const getConvIcon = (conv: Conversation) => {
    if (conv.type === 'group') return <Users size={16} className="text-accent-purple" />;
    if (conv.listingImage) return <img src={conv.listingImage} alt="" className="w-full h-full object-cover" />;
    return <span className="material-symbols-outlined text-gray-600 text-base">person</span>;
  };

  return (
    <div className="w-64 flex-shrink-0 border-r border-white/10 flex flex-col">
      <div className="px-3 py-3 border-b border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Chats</p>
          <button
            onClick={onCreateGroup}
            title="New Group"
            className="p-1 text-gray-500 hover:text-accent-purple transition-colors"
          >
            <Users size={15} />
          </button>
        </div>

        {/* DM by @username */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={dmInput}
            onChange={e => { setDmInput(e.target.value); setDmError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleDM()}
            placeholder="@username DM…"
            className="w-full pl-7 pr-8 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary/40"
          />
          {dmInput.trim() && (
            <button
              onClick={handleDM}
              disabled={dmLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-primary disabled:opacity-50"
            >
              {dmLoading
                ? <Loader size={12} className="animate-spin" />
                : <MessageSquarePlus size={12} />
              }
            </button>
          )}
        </div>
        {dmError && <p className="text-[10px] text-red-400 font-mono">{dmError}</p>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="material-symbols-outlined text-primary animate-spin">
              progress_activity
            </span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
            <span className="material-symbols-outlined text-5xl text-gray-700">
              chat_bubble_outline
            </span>
            <p className="text-gray-500 text-sm leading-relaxed">
              No conversations yet. Contact a seller or DM a user to get started.
            </p>
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 border-b border-white/5 hover:bg-white/5 transition-colors text-left ${
                  isActive ? 'bg-primary/10 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'
                }`}
              >
                {/* Avatar / thumbnail */}
                <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-black/40 border border-white/10 flex items-center justify-center">
                  {getConvIcon(conv)}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : 'text-white'}`}>
                      {getConvLabel(conv)}
                    </p>
                    {conv.type === 'group' && (
                      <span className="text-[9px] font-mono text-accent-purple border border-accent-purple/30 rounded px-1 py-0.5 shrink-0">
                        G
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-xs truncate mt-0.5">
                    {conv.lastMessageText || 'No messages yet'}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
