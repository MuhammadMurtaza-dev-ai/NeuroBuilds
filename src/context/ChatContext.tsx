import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  arrayUnion,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../Firebase';
import { writeNotification } from '../hooks/useNotifications';

const CONVERSATIONS_COLLECTION = 'conversations';

interface ChatContextValue {
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  activeConversationId: string | null;
  openChatWithConversation: (id: string) => void;
  startOrGetConversation: (
    sellerId: string,
    listingId: string,
    listingTitle: string,
    listingImage: string
  ) => Promise<string>;
  /**
   * Open (or create) the buyer↔seller conversation for a listing AND post the
   * buyer's typed message as the first message, with the listing attached as a
   * `listingRef` so the seller sees both the post reference and the text.
   */
  sendListingMessage: (
    sellerId: string,
    listing: { id: string; title: string; image: string },
    text: string
  ) => Promise<void>;
  startDirectMessage: (targetUid: string) => Promise<void>;
  createGroupChat: (participantUids: string[], groupName: string) => Promise<void>;
  unreadCount: number;
}

const ChatContext = createContext<ChatContextValue>({
  isChatOpen: false,
  setIsChatOpen: () => {},
  activeConversationId: null,
  openChatWithConversation: () => {},
  startOrGetConversation: async () => '',
  sendListingMessage: async () => {},
  startDirectMessage: async () => {},
  createGroupChat: async () => {},
  unreadCount: 0,
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let unsubConversations: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubConversations?.();
      if (!user) {
        setUnreadCount(0);
        return;
      }
      const q = query(
        collection(db, CONVERSATIONS_COLLECTION),
        where('unreadBy', 'array-contains', user.uid)
      );
      unsubConversations = onSnapshot(
        q,
        (snap) => setUnreadCount(snap.size),
        () => setUnreadCount(0)
      );
    });

    return () => {
      unsubAuth();
      unsubConversations?.();
    };
  }, []);

  const openChatWithConversation = (id: string) => {
    setActiveConversationId(id);
    setIsChatOpen(true);
  };

  const startOrGetConversation = async (
    sellerId: string,
    listingId: string,
    listingTitle: string,
    listingImage: string
  ): Promise<string> => {
    const user = auth.currentUser;
    if (!user) throw new Error('Must be logged in to start a conversation');
    if (user.uid === sellerId) throw new Error('Cannot message your own listing');

    // Check for an existing conversation between these two users for this listing
    // Requires Firestore composite index: participants (array) + listingId (asc)
    const q = query(
      collection(db, CONVERSATIONS_COLLECTION),
      where('participants', 'array-contains', user.uid),
      where('listingId', '==', listingId)
    );
    const snapshot = await getDocs(q);
    const existing = snapshot.docs.find(d =>
      (d.data().participants as string[]).includes(sellerId)
    );
    if (existing) return existing.id;

    const docRef = await addDoc(collection(db, CONVERSATIONS_COLLECTION), {
      participants: [user.uid, sellerId],
      listingId,
      listingTitle,
      listingImage,
      lastMessageText: '',
      type: 'direct',
      unreadBy: [],
      updatedAt: serverTimestamp(),
    });

    writeNotification(sellerId, {
      type: 'marketplace_message',
      title: 'New message about your listing',
      body: `${user.displayName ?? 'Someone'} started a conversation about "${listingTitle}".`,
      linkUrl: '/chat',
    }).catch(() => {});

    return docRef.id;
  };

  const sendListingMessage = async (
    sellerId: string,
    listing: { id: string; title: string; image: string },
    text: string
  ): Promise<void> => {
    const user = auth.currentUser;
    if (!user) throw new Error('Must be logged in to message a seller');
    if (user.uid === sellerId) throw new Error('Cannot message your own listing');

    const conversationId = await startOrGetConversation(
      sellerId,
      listing.id,
      listing.title,
      listing.image
    );

    const trimmed = text.trim();
    if (trimmed) {
      await addDoc(collection(db, CONVERSATIONS_COLLECTION, conversationId, 'messages'), {
        senderId: user.uid,
        senderName: user.displayName ?? user.email ?? 'User',
        text: trimmed,
        // The attached post reference travels with the message itself.
        listingRef: { id: listing.id, title: listing.title, image: listing.image },
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
        lastMessageText: trimmed,
        updatedAt: serverTimestamp(),
        unreadBy: arrayUnion(sellerId),
      });
    }

    openChatWithConversation(conversationId);
  };

  const startDirectMessage = async (targetUid: string): Promise<void> => {
    const user = auth.currentUser;
    if (!user) throw new Error('Must be logged in to start a direct message');
    if (user.uid === targetUid) throw new Error('Cannot message yourself');

    const q = query(
      collection(db, CONVERSATIONS_COLLECTION),
      where('participants', 'array-contains', user.uid),
      where('listingId', '==', ''),
      where('type', '==', 'direct')
    );
    const snapshot = await getDocs(q);
    const existing = snapshot.docs.find(d =>
      (d.data().participants as string[]).includes(targetUid)
    );

    if (existing) {
      openChatWithConversation(existing.id);
      return;
    }

    const docRef = await addDoc(collection(db, CONVERSATIONS_COLLECTION), {
      participants: [user.uid, targetUid],
      listingId: '',
      listingTitle: '',
      listingImage: '',
      lastMessageText: '',
      type: 'direct',
      unreadBy: [],
      updatedAt: serverTimestamp(),
    });

    writeNotification(targetUid, {
      type: 'marketplace_message',
      title: 'New direct message',
      body: `${user.displayName ?? 'Someone'} sent you a direct message.`,
      linkUrl: '/chat',
    }).catch(() => {});

    openChatWithConversation(docRef.id);
  };

  const createGroupChat = async (participantUids: string[], groupName: string): Promise<void> => {
    const user = auth.currentUser;
    if (!user) throw new Error('Must be logged in to create a group');

    const allParticipants = participantUids.includes(user.uid)
      ? participantUids
      : [user.uid, ...participantUids];

    const docRef = await addDoc(collection(db, CONVERSATIONS_COLLECTION), {
      participants: allParticipants,
      type: 'group',
      groupName: groupName.trim(),
      listingId: '',
      listingTitle: '',
      listingImage: '',
      lastMessageText: '',
      unreadBy: [],
      updatedAt: serverTimestamp(),
    });

    openChatWithConversation(docRef.id);
  };

  return (
    <ChatContext.Provider
      value={{
        isChatOpen,
        setIsChatOpen,
        activeConversationId,
        openChatWithConversation,
        startOrGetConversation,
        sendListingMessage,
        startDirectMessage,
        createGroupChat,
        unreadCount,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- co-located for module cohesion
export const useChatContext = () => useContext(ChatContext);
