import { useState, useEffect, useRef } from 'react';
import { useAIAssistant } from '../../hooks/useAIAssistant';
import type { ActiveBuild, ChatMessage } from '../../hooks/useAIAssistant';
import { useAISessions } from '../../hooks/useAISessions';
import { useAuth } from '../../hooks/useAuth';
import { writeNotification } from '../../hooks/useNotifications';
import BuildCanvasCard from './BuildCanvasCard';

function sessionTimeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Share page opener ─────────────────────────────────────────────────────────

function openSharePage(build: ActiveBuild) {
  const encoded = btoa(encodeURIComponent(JSON.stringify(build)));
  window.open(`/share?build=${encoded}`, '_blank', 'noopener,noreferrer');
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialMessage?: string;
}

// Renders as a React fragment so its three columns are direct flex children of
// ChatPage's <main> container (which is already display:flex flex-row).
export default function AIChatPanel({ initialMessage }: Props) {
  const { user } = useAuth();
  const {
    messages,
    isStreaming,
    isRecording,
    activeBuild,
    sendMessage,
    toggleRecording,
    speechAvailable,
    voiceTranscript,
    loadSession,
    resetSession,
  } = useAIAssistant();

  const { sessions, saveSession } = useAISessions(user?.uid ?? null);

  const [inputValue, setInputValue] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => crypto.randomUUID());
  // Mobile overlay toggles
  const [showSessionsMobile, setShowSessionsMobile] = useState(false);
  const [showBuildMobile, setShowBuildMobile] = useState(false);

  const hasBuild = Object.values(activeBuild).some(Boolean);

  // Refs for stable access inside effects
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const wasStreamingRef = useRef(false);
  const saveSessionRef = useRef(saveSession);
  useEffect(() => { saveSessionRef.current = saveSession; }, [saveSession]);

  // Guards the one-shot initial message so it never fires twice.
  const initialHandledRef = useRef(false);

  // ── Initial message from navigation state ───────────────────────────────────
  useEffect(() => {
    if (initialMessage && !initialHandledRef.current) {
      initialHandledRef.current = true;
      sendMessage(initialMessage);
    }
  }, [initialMessage, sendMessage]);

  // ── Auto-scroll on new messages ─────────────────────────────────────────────
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Sync voice transcript into the input buffer ─────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- voice transcript drives input value
    if (voiceTranscript) setInputValue(voiceTranscript);
  }, [voiceTranscript]);

  // ── Auto-save session when streaming ends ───────────────────────────────────
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && messages.length > 1) {
      const firstUser = messages.find(m => m.role === 'user');
      const title = firstUser ? firstUser.content.slice(0, 60) : 'Build session';
      saveSessionRef.current(currentSessionId, title, messages, activeBuild);

      const hasBuildResult = Object.values(activeBuild).some(Boolean);
      if (user && hasBuildResult) {
        writeNotification(user.uid, {
          type: 'ai_build_ready',
          title: 'Your AI build is ready',
          body: `Neuro AI has finished generating your PC build: "${title}".`,
          linkUrl: '/chat',
        }).catch(() => {});
      }
    }
    wasStreamingRef.current = isStreaming;
  }); // intentionally no dep array — runs after every render, tracks transition

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    const isFirstUserMessage = messages.filter(m => m.role === 'user').length === 0;
    if (isFirstUserMessage) {
      const earlyMsg: ChatMessage = {
        id: `u_eager_${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      saveSessionRef.current(
        currentSessionId,
        text.slice(0, 60),
        [...messages, earlyMsg],
        activeBuild,
      );
    }

    sendMessage(text);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const micTitle = !speechAvailable
    ? 'Speech recognition not supported in this browser'
    : isRecording
    ? 'Stop recording'
    : 'Start voice input';

  // ─── Shared session list content (used in both desktop aside and mobile overlay)
  const renderSessionListContent = () => (
    <>
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs font-mono text-gray-700 text-center leading-5">
              NO SESSIONS YET<br />
              <span className="text-gray-800">Conversations will<br />appear here.</span>
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => {
                  loadSession(s.messages, s.activeBuild);
                  setCurrentSessionId(s.id);
                  setShowSessionsMobile(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors group ${
                  s.id === currentSessionId
                    ? 'bg-primary/5 border border-primary/20'
                    : 'hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                }`}
              >
                <p className={`text-xs font-mono truncate transition-colors ${
                  s.id === currentSessionId ? 'text-primary' : 'text-gray-400 group-hover:text-[var(--text-base)]'
                }`}>
                  {s.title}
                </p>
                <p className="text-xs font-mono text-gray-700 mt-0.5">
                  {sessionTimeAgo(s.updatedAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border-glass shrink-0">
        <button
          onClick={() => {
            resetSession();
            setCurrentSessionId(crypto.randomUUID());
            setShowSessionsMobile(false);
          }}
          className="w-full min-h-11 py-3 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-mono text-gray-500 hover:text-[var(--text-base)] flex items-center justify-center gap-2 transition-colors tracking-widest"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          NEW_SESSION
        </button>
      </div>
    </>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Left: session logs (desktop only) ────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-1/4 h-full glass-panel rounded-bento overflow-hidden border border-border-glass">
        <div className="p-5 border-b border-border-glass bg-black/5 dark:bg-black/20 shrink-0">
          <h2 className="text-xs font-bold text-gray-400 tracking-[0.15em] font-mono flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">history</span>
            SESSION_LOGS
          </h2>
          {!user && (
            <p className="text-[9px] font-mono text-gray-700 mt-1">Sign in to sync across devices</p>
          )}
        </div>
        {renderSessionListContent()}
      </aside>

      {/* ── Center: chat window + generate button ─────────────────────────── */}
      <section className="flex flex-col w-full md:w-1/2 h-full gap-4 min-h-0">
        {/* Terminal panel */}
        <div className="flex-1 glass-panel rounded-bento flex flex-col overflow-hidden border border-primary/20 shadow-[0_0_30px_rgba(13,242,242,0.05)] relative min-h-0">
          {/* Scanline overlay */}
          <div className="absolute inset-0 scanline pointer-events-none z-20 opacity-30" />

          {/* Terminal chrome */}
          <div className="bg-bg-panel px-4 py-3 flex items-center justify-between border-b border-border-glass z-30 shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-[10px] font-mono text-gray-500 tracking-widest">
              NEURO_CORE_V2.4.exe
            </span>
            <div className="flex items-center gap-3">
              {isStreaming && (
                <span className="text-[9px] font-mono text-primary animate-pulse tracking-widest">
                  STREAMING...
                </span>
              )}
              <span className="material-symbols-outlined text-gray-600 text-sm">settings</span>
            </div>
          </div>

          {/* Mobile-only quick-access toolbar */}
          <div className="md:hidden flex items-center gap-2 px-3 py-2 bg-black/5 dark:bg-black/20 border-b border-border-glass z-30 shrink-0 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setShowSessionsMobile(true)}
              className="min-h-11 flex items-center gap-1.5 px-4 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              Sessions
            </button>
            <button
              onClick={() => setShowBuildMobile(true)}
              className={`min-h-11 flex items-center gap-1.5 px-4 rounded-xl bg-white/5 border text-xs transition-colors shrink-0 ${
                hasBuild
                  ? 'border-primary/40 text-primary'
                  : 'border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">construction</span>
              Build{hasBuild ? ' (active)' : ''}
            </button>
          </div>

          {/* Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-bg-dark relative z-10 min-h-0"
          >
            {messages.map((msg, index) => {
              const isLastAssistant =
                index === messages.length - 1 && msg.role === 'assistant';

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                      msg.role === 'user'
                        ? 'bg-accent-purple/10 border-accent-purple/30'
                        : 'bg-primary/10 border-primary/30'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {msg.role === 'user' ? 'person' : 'smart_toy'}
                    </span>
                  </div>

                  {/* Bubble */}
                  <div
                    className={`flex flex-col gap-1 max-w-[85%] ${
                      msg.role === 'user' ? 'items-end' : ''
                    }`}
                  >
                    <span
                      className={`text-[9px] font-mono mb-0.5 ${
                        msg.role === 'user' ? 'text-accent-purple/60' : 'text-primary/60'
                      }`}
                    >
                      {msg.timestamp}
                    </span>
                    <div
                      className={`rounded-2xl p-3 md:p-4 text-xs leading-5 font-mono ${
                        msg.role === 'user'
                          ? 'bg-accent-purple/10 border border-accent-purple/20 rounded-tr-none shadow-[0_0_15px_rgba(191,0,255,0.05)]'
                          : 'bg-black/5 dark:bg-white/5 border border-black/8 dark:border-white/5 rounded-tl-none'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">
                        {msg.content}
                        {isStreaming && isLastAssistant && (
                          <span className="animate-pulse text-primary ml-0.5">▋</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input bar */}
          <div className="p-3 md:p-4 bg-bg-panel border-t border-border-glass z-30 shrink-0">
            <div
              className={`relative flex items-end gap-2 bg-bg-dark p-2 rounded-xl border transition-all ${
                isRecording
                  ? 'border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                  : 'border-black/10 dark:border-white/10 focus-within:border-primary/50 focus-within:shadow-[0_0_15px_rgba(13,242,242,0.1)]'
              }`}
            >
              {/* Mic button */}
              <button
                onClick={toggleRecording}
                title={micTitle}
                disabled={!speechAvailable}
                className={`relative size-11 flex items-center justify-center rounded-lg transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
                  isRecording
                    ? 'text-red-400 bg-red-500/10'
                    : 'text-gray-500 hover:text-[var(--text-base)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {isRecording && (
                  <span className="absolute inset-0 rounded-lg border border-red-500/70 animate-ping" />
                )}
                <span className="material-symbols-outlined relative z-10 text-[22px]">
                  {isRecording ? 'mic_off' : 'mic'}
                </span>
              </button>

              {/* Text input */}
              <textarea
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                rows={1}
                className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono placeholder-[var(--text-muted)] resize-none py-2.5 leading-5 disabled:opacity-40"
                placeholder={isStreaming ? 'Neuro is thinking...' : 'Reply to Neuro...'}
              />

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={isStreaming || !inputValue.trim()}
                className="size-11 flex items-center justify-center bg-primary hover:bg-cyan-300 disabled:bg-gray-700 disabled:text-gray-500 text-black rounded-lg transition-colors shadow-lg shadow-primary/20 disabled:shadow-none shrink-0"
                aria-label="Send message"
              >
                <span className="material-symbols-outlined text-[22px]">send</span>
              </button>
            </div>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={() => hasBuild && openSharePage(activeBuild)}
          title={hasBuild ? 'Open shareable build summary in a new tab' : 'Chat with Neuro first to generate a build'}
          className={`w-full min-h-14 px-4 py-3 rounded-bento bg-gradient-to-r from-accent-purple/80 to-purple-900/80 border border-accent-purple/30 text-white text-xs sm:text-sm font-bold tracking-widest flex items-center justify-center gap-2 sm:gap-3 text-center transition-all group shrink-0 backdrop-blur-md ${
            hasBuild
              ? 'hover:from-accent-purple hover:to-purple-800 shadow-[0_0_20px_rgba(191,0,255,0.2)] hover:shadow-[0_0_30px_rgba(191,0,255,0.4)] cursor-pointer'
              : 'opacity-40 cursor-not-allowed'
          }`}
        >
          <span className={`material-symbols-outlined transition-transform ${hasBuild ? 'group-hover:rotate-12' : ''}`}>
            construction
          </span>
          GENERATE PC PART PICKER LIST
          <span className="material-symbols-outlined text-sm opacity-50">open_in_new</span>
        </button>
      </section>

      {/* ── Right: build canvas (desktop only) ───────────────────────────── */}
      <aside className="hidden md:flex flex-col w-1/4 h-full">
        <BuildCanvasCard activeBuild={activeBuild} />
      </aside>

      {/* ── Mobile: sessions full-screen overlay ──────────────────────────── */}
      {showSessionsMobile && (
        <div className="fixed inset-0 z-[80] md:hidden flex flex-col bg-bg-panel">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-border-glass shrink-0">
            <button
              onClick={() => setShowSessionsMobile(false)}
              className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              aria-label="Close sessions"
            >
              <span className="material-symbols-outlined text-gray-400">close</span>
            </button>
            <h2 className="text-sm font-bold tracking-[0.15em] font-mono">SESSION_LOGS</h2>
          </div>
          {!user && (
            <p className="text-xs font-mono text-gray-500 px-5 py-2">Sign in to sync across devices</p>
          )}
          <div className="flex flex-col flex-1 overflow-hidden">
            {renderSessionListContent()}
          </div>
        </div>
      )}

      {/* ── Mobile: build canvas full-screen overlay ─────────────────────── */}
      {showBuildMobile && (
        <div className="fixed inset-0 z-[80] md:hidden flex flex-col bg-bg-panel">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-border-glass shrink-0">
            <button
              onClick={() => setShowBuildMobile(false)}
              className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              aria-label="Close build canvas"
            >
              <span className="material-symbols-outlined text-gray-400">close</span>
            </button>
            <h2 className="text-sm font-bold text-primary font-mono tracking-widest">BUILD CANVAS</h2>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            <BuildCanvasCard activeBuild={activeBuild} />
          </div>
        </div>
      )}
    </>
  );
}
