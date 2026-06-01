import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../Firebase';
import { useAuth } from './useAuth';

export interface Conversation {
  id: string;
  participants: string[];
  listingId: string;
  listingTitle: string;
  listingImage: string;
  lastMessageText: string;
  updatedAt: Timestamp | null;
  unreadBy: string[];
  type?: 'direct' | 'group';
  groupName?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Timestamp | null;
}

const CONVERSATIONS_COLLECTION = 'conversations';

const docToConversation = (id: string, data: DocumentData): Conversation => ({
  id,
  participants: data.participants ?? [],
  listingId: data.listingId ?? '',
  listingTitle: data.listingTitle ?? '',
  listingImage: data.listingImage ?? '',
  lastMessageText: data.lastMessageText ?? '',
  updatedAt: data.updatedAt ?? null,
  unreadBy: data.unreadBy ?? [],
  type: data.type ?? 'direct',
  groupName: data.groupName ?? undefined,
});

const docToMessage = (id: string, data: DocumentData): Message => ({
  id,
  senderId: data.senderId ?? '',
  senderName: data.senderName ?? '',
  text: data.text ?? '',
  createdAt: data.createdAt ?? null,
});

export const useChats = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      return;
    }

    setLoadingConversations(true);
    const q = query(
      collection(db, CONVERSATIONS_COLLECTION),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setConversations(snapshot.docs.map(d => docToConversation(d.id, d.data())));
        setLoadingConversations(false);
      },
      (err) => {
        setError(err.message);
        setLoadingConversations(false);
      }
    );

    return unsub;
  }, [user]);

  useEffect(() => {
    return () => {
      messagesUnsubRef.current?.();
    };
  }, []);

  const subscribeToMessages = useCallback((conversationId: string) => {
    messagesUnsubRef.current?.();
    setMessages([]);
    setLoadingMessages(true);

    const q = query(
      collection(db, CONVERSATIONS_COLLECTION, conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setMessages(snapshot.docs.map(d => docToMessage(d.id, d.data())));
        setLoadingMessages(false);
      },
      (err) => {
        setError(err.message);
        setLoadingMessages(false);
      }
    );

    messagesUnsubRef.current = unsub;
    return unsub;
  }, []);

  const sendMessage = async (conversationId: string, text: string): Promise<void> => {
    if (!user) throw new Error('Must be logged in to send a message');
    const trimmed = text.trim();
    if (!trimmed) return;

    const otherParticipants = conversations
      .find(c => c.id === conversationId)
      ?.participants.filter(p => p !== user.uid) ?? [];

    await addDoc(
      collection(db, CONVERSATIONS_COLLECTION, conversationId, 'messages'),
      {
        senderId: user.uid,
        senderName: user.displayName || user.email || 'User',
        text: trimmed,
        createdAt: serverTimestamp(),
      }
    );

    await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
      lastMessageText: trimmed,
      updatedAt: serverTimestamp(),
      ...(otherParticipants.length > 0 ? { unreadBy: arrayUnion(...otherParticipants) } : {}),
    });
  };

  const markConversationRead = useCallback(async (conversationId: string): Promise<void> => {
    if (!user) return;
    await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
      unreadBy: arrayRemove(user.uid),
    });
  }, [user]);

  const createGroupConversation = async (
    participantUids: string[],
    groupName: string
  ): Promise<string> => {
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
    return docRef.id;
  };

  const addParticipantToGroup = async (
    conversationId: string,
    newUid: string
  ): Promise<void> => {
    await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
      participants: arrayUnion(newUid),
    });
  };

  return {
    conversations,
    messages,
    loadingConversations,
    loadingMessages,
    error,
    sendMessage,
    subscribeToMessages,
    markConversationRead,
    createGroupConversation,
    addParticipantToGroup,
  };
};
