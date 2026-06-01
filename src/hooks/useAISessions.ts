import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../Firebase';
import type { ChatMessage, ActiveBuild } from './useAIAssistant';

export interface AISession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  activeBuild: ActiveBuild;
}

// ─── localStorage helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = 'neurobuilds_ai_sessions';

function readLocalSessions(): AISession[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AISession[];
  } catch {
    return [];
  }
}

function writeLocalSessions(sessions: AISession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 20)));
  } catch {
    // localStorage may be unavailable (private browsing, storage quota exceeded)
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAISessions(uid: string | null) {
  // Initialise from localStorage immediately for instant paint on both auth states.
  const [sessions, setSessions] = useState<AISession[]>(() => readLocalSessions());

  useEffect(() => {
    if (!uid) {
      // Unauthenticated: localStorage is the only source of truth.
      setSessions(readLocalSessions());
      return;
    }

    // Authenticated: Firestore is the authoritative source; keep localStorage in sync
    // so the next page load shows instant state before the first snapshot arrives.
    const q = query(
      collection(db, 'users', uid, 'aiSessions'),
      orderBy('updatedAt', 'desc'),
      limit(20),
    );
    return onSnapshot(q, snap => {
      const firestoreSessions = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title ?? 'Untitled',
          updatedAt:
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : String(data.updatedAt ?? ''),
          messages: (data.messages ?? []) as ChatMessage[],
          activeBuild: (data.activeBuild ?? {}) as ActiveBuild,
        };
      });
      setSessions(firestoreSessions);
      writeLocalSessions(firestoreSessions);
    });
  }, [uid]);

  const saveSession = useCallback(
    (
      sessionId: string,
      title: string,
      messages: ChatMessage[],
      activeBuild: ActiveBuild,
    ): void => {
      const newSession: AISession = {
        id: sessionId,
        title,
        updatedAt: new Date().toISOString(),
        messages,
        activeBuild,
      };

      if (!uid) {
        // Unauthenticated: persist to localStorage only.
        setSessions(prev => {
          const updated = [newSession, ...prev.filter(s => s.id !== sessionId)].slice(0, 20);
          writeLocalSessions(updated);
          return updated;
        });
        return;
      }

      // Authenticated: Firestore is primary; the onSnapshot listener will update state.
      setDoc(
        doc(db, 'users', uid, 'aiSessions', sessionId),
        {
          title,
          messages: messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
          activeBuild,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch(console.error);
    },
    [uid],
  );

  return { sessions, saveSession };
}
