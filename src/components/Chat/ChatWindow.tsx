import { useState, useEffect, useRef } from 'react';
import { Users } from 'lucide-react';
import type { Message } from '../../hooks/useChats';

interface Props {
  messages: Message[];
  loading: boolean;
  conversationId: string | null;
  currentUserId: string;
  onSendMessage: (text: string) => Promise<void>;
  conversationType?: 'direct' | 'group';
  groupName?: string;
  listingTitle?: string;
}

export default function ChatWindow({
  messages,
  loading,
  conversationId,
  currentUserId,
  onSendMessage,
  conversationType,
  groupName,
  listingTitle,
}: Props) {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear input when switching conversations
  useEffect(() => {
    setInputText('');
  }, [conversationId]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    setInputText('');
    try {
      await onSendMessage(text);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
          <span className="material-symbols-outlined text-5xl text-gray-600">
            mark_chat_unread
          </span>
        </div>
        <div>
          <p className="text-white font-medium mb-1">No chat selected</p>
          <p className="text-gray-500 text-sm">
            Choose a conversation from the left, or contact a seller from the Marketplace.
          </p>
        </div>
      </div>
    );
  }

  const headerLabel = conversationType === 'group'
    ? groupName ?? 'Group Chat'
    : listingTitle ?? 'Direct Message';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Conversation header */}
      <div className="px-4 py-2.5 border-b border-white/10 bg-black/20 flex items-center gap-2 shrink-0">
        {conversationType === 'group'
          ? <Users size={14} className="text-accent-purple shrink-0" />
          : <span className="material-symbols-outlined text-gray-500 text-[15px]">chat</span>
        }
        <span className="text-sm font-medium text-white truncate">{headerLabel}</span>
        {conversationType === 'group' && (
          <span className="text-[10px] font-mono text-accent-purple border border-accent-purple/30 rounded px-1.5 py-0.5 shrink-0">GROUP</span>
        )}
      </div>

      {/* Message bubbles */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <span className="material-symbols-outlined text-primary animate-spin">
              progress_activity
            </span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
            <span className="material-symbols-outlined text-4xl text-gray-700">chat</span>
            <p className="text-gray-500 text-sm">Send the first message!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === currentUserId;
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMine
                      ? 'bg-primary text-bg-dark font-medium rounded-br-sm shadow-[0_0_12px_rgba(13,242,242,0.2)]'
                      : 'bg-white/10 text-white rounded-bl-sm'
                  }`}
                >
                  {!isMine && (
                    <p className="text-xs font-bold mb-1 text-accent-purple">
                      {msg.senderName}
                    </p>
                  )}
                  {msg.listingRef && (
                    <div
                      className={`flex items-center gap-2 mb-2 rounded-xl px-2 py-1.5 ${
                        isMine ? 'bg-black/15' : 'bg-black/30'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-md overflow-hidden bg-black/30 shrink-0 flex items-center justify-center">
                        {msg.listingRef.image ? (
                          <img src={msg.listingRef.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-[16px] leading-none opacity-60">sell</span>
                        )}
                      </div>
                      <span className={`text-[11px] font-medium truncate ${isMine ? 'text-bg-dark/80' : 'text-gray-300'}`}>
                        Re: {msg.listingRef.title}
                      </span>
                    </div>
                  )}
                  <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.text}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="p-3 border-t border-white/10 flex gap-2 items-end bg-black/20">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          rows={1}
          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none resize-none"
          style={{ maxHeight: '100px', overflowY: 'auto' }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          className="p-3 rounded-xl bg-primary text-bg-dark hover:bg-cyan-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 shadow-[0_0_10px_rgba(13,242,242,0.2)]"
          aria-label="Send message"
        >
          <span className="material-symbols-outlined text-[20px] leading-none">send</span>
        </button>
      </div>
    </div>
  );
}
