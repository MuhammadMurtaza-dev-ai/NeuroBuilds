import { useEffect, useState } from 'react';
import { useChatContext } from '../../context/ChatContext';
import { useChats } from '../../hooks/useChats';
import { useAuth } from '../../hooks/useAuth';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import { CreateGroupModal } from './CreateGroupModal';

export default function ChatSidebar() {
  const {
    isChatOpen,
    setIsChatOpen,
    activeConversationId,
    openChatWithConversation,
    startDirectMessage,
    createGroupChat,
  } = useChatContext();
  const { user } = useAuth();
  const {
    conversations,
    messages,
    loadingConversations,
    loadingMessages,
    sendMessage,
    subscribeToMessages,
    markConversationRead,
  } = useChats();

  const [showGroupModal, setShowGroupModal] = useState(false);
  // On mobile: false = show conversation list, true = show chat window
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  // Subscribe to messages and clear unread flag whenever the active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      const unsub = subscribeToMessages(activeConversationId);
      markConversationRead(activeConversationId);
      return unsub;
    }
  }, [activeConversationId, subscribeToMessages, markConversationRead]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-300 ${
          isChatOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => {
          setIsChatOpen(false);
          setShowChatOnMobile(false);
        }}
      />

      {/* Sliding panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:max-w-3xl z-[70] flex flex-col
          bg-bg-panel border-l border-white/10 shadow-2xl
          transition-transform duration-300 ease-in-out
          ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-glass bg-black/5 dark:bg-black/20 flex-shrink-0">
          {/* Back to list button on mobile when in chat view */}
          {showChatOnMobile && (
            <button
              onClick={() => setShowChatOnMobile(false)}
              className="md:hidden size-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors mr-1"
              aria-label="Back to conversations"
            >
              <span className="material-symbols-outlined text-gray-400 text-[20px]">arrow_back</span>
            </button>
          )}
          <h2 className="font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">chat</span>
            {showChatOnMobile ? (activeConversation?.groupName ?? activeConversation?.listingTitle ?? 'Messages') : 'Messages'}
          </h2>
          <button
            onClick={() => {
              setIsChatOpen(false);
              setShowChatOnMobile(false);
            }}
            className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close chat"
          >
            <span className="material-symbols-outlined text-gray-400">close</span>
          </button>
        </div>

        {/* Body */}
        {!user ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
              <span className="material-symbols-outlined text-5xl text-gray-600">lock</span>
            </div>
            <div>
              <p className="text-white font-medium mb-1">Sign in to access messages</p>
              <p className="text-gray-500 text-sm">
                You need to be logged in to send and receive messages.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left pane: conversation list — full width on mobile, fixed w-64 on desktop */}
            <div
              className={`flex-col overflow-hidden ${
                showChatOnMobile ? 'hidden md:flex' : 'flex'
              } w-full md:w-auto`}
            >
              <ConversationList
                conversations={conversations}
                activeConversationId={activeConversationId}
                currentUserId={user.uid}
                loading={loadingConversations}
                onSelectConversation={(id) => {
                  openChatWithConversation(id);
                  setShowChatOnMobile(true);
                }}
                onStartDM={async (uid) => {
                  await startDirectMessage(uid);
                  setShowChatOnMobile(true);
                }}
                onCreateGroup={() => setShowGroupModal(true)}
              />
            </div>

            {/* Right pane: active chat window */}
            <div
              className={`flex-1 flex-col overflow-hidden ${
                showChatOnMobile ? 'flex' : 'hidden md:flex'
              }`}
            >
              <ChatWindow
                messages={messages}
                loading={loadingMessages}
                conversationId={activeConversationId}
                currentUserId={user.uid}
                onSendMessage={(text) =>
                  activeConversationId
                    ? sendMessage(activeConversationId, text)
                    : Promise.resolve()
                }
                conversationType={activeConversation?.type ?? 'direct'}
                groupName={activeConversation?.groupName}
                listingTitle={activeConversation?.listingTitle}
              />
            </div>
          </div>
        )}
      </div>

      {/* Group creation modal */}
      {showGroupModal && user && (
        <CreateGroupModal
          currentUid={user.uid}
          onCreate={async (uids, name) => {
            await createGroupChat(uids, name);
          }}
          onClose={() => setShowGroupModal(false)}
        />
      )}
    </>
  );
}
