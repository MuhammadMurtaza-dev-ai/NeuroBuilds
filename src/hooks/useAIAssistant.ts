import { useState, useCallback, useEffect, useRef } from 'react';
import { telemetry, parseValidationsFromResponse } from '../utils/telemetryTracker';

const AI_SERVICE_URL =
  (import.meta.env.VITE_AI_SERVICE_URL as string | undefined) ?? 'http://localhost:8000';

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// ─── Public types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface BuildComponent {
  name: string;
  tdp?: number;      // thermal design power in watts (CPU / GPU)
  rating?: number;   // rated wattage (PSU only)
  price?: number;
  specs?: Record<string, string>;
}

export interface ActiveBuild {
  cpu?: BuildComponent;
  gpu?: BuildComponent;
  motherboard?: BuildComponent;
  ram?: BuildComponent;
  psu?: BuildComponent;
}

// ─── Mock fallback text ────────────────────────────────────────────────────────
// Shown when the Python FastAPI service is unreachable during local UI dev.
// Mirrors the structure a real LangGraph multi-agent pipeline would return.

const MOCK_RESPONSE = `Analyzing your requirements through the LangGraph compatibility pipeline...

[AGENT: hardware_selector] → Evaluating CPU/GPU combinations for your target use case...
[AGENT: compatibility_checker] → Validating socket, memory, and power compatibility...
[AGENT: budget_optimizer] → Finalizing configuration against your performance targets...

Based on your requirements, I recommend the following balanced 1440p gaming build:

\`\`\`json
{
  "build": {
    "cpu": {
      "name": "AMD Ryzen 5 7600X",
      "tdp": 105,
      "price": 229,
      "specs": {
        "cores": "6",
        "threads": "12",
        "base_clock": "4.7 GHz",
        "boost_clock": "5.3 GHz",
        "socket": "AM5",
        "cache": "38MB"
      }
    },
    "gpu": {
      "name": "NVIDIA GeForce RTX 4070",
      "tdp": 200,
      "price": 599,
      "specs": {
        "vram": "12GB GDDR6X",
        "memory_bus": "192-bit",
        "boost_clock": "2.475 GHz",
        "cuda_cores": "5888"
      }
    },
    "motherboard": {
      "name": "ASUS ROG STRIX B650-A",
      "price": 199,
      "specs": {
        "socket": "AM5",
        "form_factor": "ATX",
        "memory_slots": "4",
        "chipset": "B650",
        "max_memory": "128GB DDR5"
      }
    },
    "ram": {
      "name": "Corsair Vengeance DDR5-5600 32GB",
      "price": 89,
      "specs": {
        "capacity": "32GB",
        "speed": "DDR5-5600",
        "latency": "CL36",
        "kit": "2x16GB"
      }
    },
    "psu": {
      "name": "Corsair RM750x",
      "rating": 750,
      "price": 109,
      "specs": {
        "wattage": "750W",
        "efficiency": "80+ Gold",
        "modular": "Fully Modular",
        "warranty": "10 years"
      }
    }
  }
}
\`\`\`

This build delivers excellent 1440p gaming at high-to-ultra settings. Total estimated system draw is ~455W under full load (105W CPU + 200W GPU + 150W buffer), leaving comfortable headroom on the 750W PSU. Estimated build cost: ~$1,225 USD.`;

// ─── Stream helpers ────────────────────────────────────────────────────────────

async function* mockTokenStream(text: string): AsyncGenerator<string, void, unknown> {
  // Split on whitespace boundaries while keeping the delimiters so that
  // newlines and indentation in the JSON block are faithfully preserved.
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    yield part;
    if (part.trim()) await new Promise<void>(resolve => setTimeout(resolve, 22));
  }
}

async function* liveStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Build extraction ──────────────────────────────────────────────────────────

function extractBuild(text: string): ActiveBuild | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { build?: ActiveBuild };
    if (parsed?.build && typeof parsed.build === 'object') return parsed.build;
  } catch {
    // malformed JSON block — silently ignore
  }
  return null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'init',
    role: 'assistant',
    content:
      'System initialized. I am Neuro, the AI-Assisted Orchestration Pipeline for budget-constrained PC builds. Describe your needs, budget, and performance targets.',
    timestamp: 'NEURO_AI <SYSTEM>',
  },
];

export function useAIAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeBuild, setActiveBuild] = useState<ActiveBuild>({});

  // Refs give sendMessage stable access to latest state without requiring it
  // to be recreated on every state change, keeping its identity stable.
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const activeBuildRef = useRef<ActiveBuild>(activeBuild);
  activeBuildRef.current = activeBuild;

  // Prevents concurrent sends without adding isStreaming to sendMessage deps.
  const isStreamingRef = useRef(false);

  // Telemetry timing refs — stable across renders, no extra deps needed.
  const requestStartRef      = useRef<number>(0);
  const firstChunkTimeRef    = useRef<number | null>(null);
  const isMockFallbackRef    = useRef<boolean>(false);

  const speechAvailable = !!SpeechRecognition;
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setVoiceTranscript(transcript);
    };
    rec.onend = () => setIsRecording(false);
    rec.onerror = () => setIsRecording(false);
    recognitionRef.current = rec;
    return () => rec.stop();
  }, []); // setIsRecording is a stable React setter

  const toggleRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (isRecording) {
      rec.stop();
      setIsRecording(false);
    } else {
      try {
        rec.start();
        setIsRecording(true);
      } catch {
        rec.stop();
        setIsRecording(false);
      }
    }
  }, [isRecording]); // setIsRecording is a stable React setter

  const sendMessage = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || isStreamingRef.current) return;

    isStreamingRef.current = true;
    setIsStreaming(true);

    requestStartRef.current   = Date.now();
    firstChunkTimeRef.current = null;
    isMockFallbackRef.current = false;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: 'USER_01',
    };

    const assistantId = `a_${Date.now() + 1}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: 'NEURO_AI <RESPONSE>',
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    let accumulated = '';

    const applyChunk = (chunk: string) => {
      if (firstChunkTimeRef.current === null) {
        firstChunkTimeRef.current = Date.now() - requestStartRef.current;
      }
      accumulated += chunk;
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, content: accumulated } : m)),
      );
    };

    try {
      const historyForAPI = [...messagesRef.current, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(`${AI_SERVICE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyForAPI,
          activeBuild: activeBuildRef.current,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok || !response.body) throw new Error('Service unavailable');

      for await (const chunk of liveStream(response.body)) {
        applyChunk(chunk);
      }
    } catch {
      // Python service is offline — run the local mock stream so the UI
      // remains fully demonstrable without the backend running.
      isMockFallbackRef.current = true;
      accumulated = '';
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, content: '' } : m)),
      );
      for await (const chunk of mockTokenStream(MOCK_RESPONSE)) {
        applyChunk(chunk);
      }
    }

    // Record telemetry for this request and parse any compatibility warnings.
    telemetry.recordAIRequest({
      requestId:          assistantId,
      promptSnippet:      trimmed.slice(0, 60),
      startedAt:          requestStartRef.current,
      timeToFirstTokenMs: firstChunkTimeRef.current,
      totalDurationMs:    Date.now() - requestStartRef.current,
      characterCount:     accumulated.length,
      isMockFallback:     isMockFallbackRef.current,
    });
    parseValidationsFromResponse(accumulated).forEach(v => telemetry.recordValidation(v));

    // Parse any structured build JSON the model emitted and merge into state.
    const extracted = extractBuild(accumulated);
    if (extracted) {
      setActiveBuild(prev => ({ ...prev, ...extracted }));
    }

    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []); // stable — all mutable state is accessed through refs

  const loadSession = useCallback((msgs: ChatMessage[], build: ActiveBuild) => {
    setMessages(msgs);
    setActiveBuild(build);
  }, []);

  const resetSession = useCallback(() => {
    setMessages(INITIAL_MESSAGES);
    setActiveBuild({});
  }, []);

  return {
    messages,
    isStreaming,
    isRecording,
    setIsRecording,
    speechAvailable,
    toggleRecording,
    voiceTranscript,
    activeBuild,
    sendMessage,
    loadSession,
    resetSession,
  };
}
