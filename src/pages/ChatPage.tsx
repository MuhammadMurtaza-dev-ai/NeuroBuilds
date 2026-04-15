import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import '../components/Dashboard/Dashboard.css'
import GradientBackground from '../components/GradientBackground/GradientBackground'

interface Message {
  id: string
  type: 'user' | 'ai'
  content: string
  timestamp: string
}

interface SessionLog {
  title: string
  status: string
  time: string
  active: boolean
}

interface Component {
  title: string
  category: string
  price: string
  image: string
  categoryColor: string
}

export default function ChatPage() {
  const location = useLocation()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [sessionLogs] = useState<SessionLog[]>([])
  const [detectedComponents] = useState<Component[]>([])
  const [hasAddedInitialMessage, setHasAddedInitialMessage] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Initialize with system message on first load
  useEffect(() => {
    if (!hasAddedInitialMessage) {
      setMessages([
        {
          id: '1',
          type: 'ai',
          content: 'System initialized. I am Neuro, your AI hardware architect. Describe your needs, budget, and performance targets.',
          timestamp: 'NEURO_AI <SYSTEM>'
        }
      ])
      setHasAddedInitialMessage(true)
    }
  }, [hasAddedInitialMessage])

  // Handle initial message from navigation
  useEffect(() => {
    if (location.state?.initialMessage && hasAddedInitialMessage) {
      handleSendMessage(location.state.initialMessage)
    }
  }, [hasAddedInitialMessage])

  // Auto-scroll to latest message
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = (text?: string) => {
    const messageText = text || inputValue.trim()
    if (!messageText) return

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: messageText,
      timestamp: 'USER_01'
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')

    // TODO: Add your AI model integration here
    // Replace this placeholder with your actual AI API call
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'Awaiting AI model integration...',
        timestamp: 'NEURO_AI <RESPONSE>'
      }
      setMessages(prev => [...prev, aiMessage])
    }, 500)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 pt-28 pb-10 px-4 md:px-6 max-w-[1600px] mx-auto w-full h-screen flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Session Logs Sidebar */}
      <aside className="hidden md:flex flex-col w-1/4 h-full glass-panel rounded-bento overflow-hidden border border-white/5">
        <div className="p-6 border-b border-white/5 bg-black/20">
          <h2 className="text-xs font-bold text-gray-400 tracking-widest font-mono flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">history</span>
            SESSION_LOGS
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sessionLogs.map((log, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-xl cursor-pointer transition-all ${
                log.active
                  ? 'bg-primary/10 border border-primary/40'
                  : 'bg-white/5 border border-white/5 hover:bg-white/10'
              }`}
            >
              {log.active && (
                <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              )}
              <div className={`text-sm font-bold ${log.active ? 'text-white' : 'text-gray-300'} mb-1`}>
                {log.title}
              </div>
              <div className={`text-[10px] ${log.active ? 'text-primary/80' : 'text-gray-500'} font-mono uppercase`}>
                Status: {log.status}
              </div>
              <div className="text-[10px] text-gray-500 font-mono mt-2">
                {log.active ? 'Started: ' : ''}{log.time}
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-white/5">
          <button className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-mono text-gray-400 flex items-center justify-center gap-2 transition-colors">
            <span className="material-symbols-outlined text-sm">add</span>
            NEW_SESSION
          </button>
        </div>
      </aside>

      {/* Chat Section */}
      <section className="flex flex-col w-full md:w-1/2 h-full gap-4 pb-8 md:pb-0">
        <div className="flex-1 glass-panel rounded-bento flex flex-col overflow-hidden border border-primary/20 shadow-[0_0_30px_rgba(13,242,242,0.05)] relative">
          <div className="absolute inset-0 scanline pointer-events-none z-20 opacity-30"></div>
          
          {/* Terminal Header */}
          <div className="bg-[#111] px-4 py-3 flex items-center justify-between border-b border-white/5 z-30">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <div className="text-[10px] font-mono text-gray-500 tracking-widest">NEURO_CORE_V2.4.exe</div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-gray-600 text-sm">settings</span>
            </div>
          </div>

          {/* Chat Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#151515] relative z-10"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-4 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                  message.type === 'user'
                    ? 'bg-accent-purple/10 border-accent-purple/30'
                    : 'bg-primary/10 border-primary/30'
                }`}>
                  <span className="material-symbols-outlined text-sm">
                    {message.type === 'user' ? 'person' : 'smart_toy'}
                  </span>
                </div>
                <div className={`flex flex-col gap-1 max-w-[85%] ${message.type === 'user' ? 'items-end' : ''}`}>
                  <span className={`text-[10px] font-mono mb-1 ${
                    message.type === 'user'
                      ? 'text-accent-purple/70'
                      : 'text-primary/70'
                  }`}>
                    {message.timestamp}
                  </span>
                  <div className={`rounded-2xl p-4 text-sm leading-relaxed ${
                    message.type === 'user'
                      ? 'bg-accent-purple/10 border border-accent-purple/20 rounded-tr-none text-white shadow-[0_0_15px_rgba(191,0,255,0.05)]'
                      : 'bg-white/5 border border-white/5 rounded-tl-none text-gray-300'
                  }`}>
                    <p>{message.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-[#111] border-t border-white/5 z-30">
            <div className="relative flex items-end gap-2 bg-[#1e1e1e] p-2 rounded-xl border border-white/10 focus-within:border-primary/50 focus-within:shadow-[0_0_15px_rgba(13,242,242,0.1)] transition-all">
              <button className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Speech to Text">
                <span className="material-symbols-outlined">mic</span>
              </button>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono text-white placeholder-gray-600 resize-none h-10 py-2.5"
                placeholder="Reply to Neuro..."
              />
              <button className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Text to Speech">
                <span className="material-symbols-outlined">volume_up</span>
              </button>
              <button
                onClick={() => handleSendMessage()}
                className="p-2 bg-primary hover:bg-cyan-300 text-black rounded-lg transition-colors shadow-lg shadow-primary/20"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <button className="w-full py-4 rounded-bento bg-gradient-to-r from-accent-purple/80 to-purple-900/80 hover:from-accent-purple hover:to-purple-800 border border-accent-purple/30 text-white font-bold tracking-widest flex items-center justify-center gap-3 transition-all shadow-[0_0_20px_rgba(191,0,255,0.2)] hover:shadow-[0_0_30px_rgba(191,0,255,0.4)] group z-10 backdrop-blur-md">
          <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">construction</span>
          GENERATE PC PART PICKER LIST
          <span className="material-symbols-outlined text-sm opacity-50">open_in_new</span>
        </button>
      </section>

      {/* Detected Components Sidebar */}
      <aside className="hidden md:flex flex-col w-1/4 h-full glass-panel rounded-bento overflow-hidden border border-white/5">
        <div className="p-6 border-b border-white/5 bg-black/20">
          <h2 className="text-xs font-bold text-gray-400 tracking-widest font-mono flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">memory</span>
            DETECTED_COMPONENTS
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-[10px] text-gray-500 font-mono mb-2">BASED ON CHAT CONTEXT:</p>
          {detectedComponents.map((component, idx) => (
            <div
              key={idx}
              className={`group relative bg-bg-panel rounded-2xl p-3 border border-white/5 transition-all cursor-pointer overflow-hidden ${
                component.categoryColor === 'text-accent-purple'
                  ? 'hover:border-accent-purple/50'
                  : 'hover:border-primary/50'
              }`}
            >
              <div className={`absolute inset-0 ${
                component.categoryColor === 'text-accent-purple'
                  ? 'bg-accent-purple/5'
                  : 'bg-primary/5'
              } opacity-0 group-hover:opacity-100 transition-opacity`}></div>
              <div className="flex gap-3 relative z-10">
                <div
                  className="w-16 h-16 rounded-xl bg-black/50 bg-cover bg-center shrink-0 border border-white/10"
                  style={{ backgroundImage: `url("${component.image}")` }}
                ></div>
                <div className="flex flex-col justify-center">
                  <div className={`text-[10px] font-bold uppercase mb-1 ${component.categoryColor}`}>
                    {component.category}
                  </div>
                  <h4 className="text-sm font-bold text-white leading-tight">
                    {component.title}
                  </h4>
                  <div className="flex items-center justify-between mt-1 w-full gap-4">
                    <span className="text-xs text-gray-300">{component.price}</span>
                    <span className="material-symbols-outlined text-xs text-gray-500 group-hover:text-white">
                      add_circle
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-white/5 bg-black/10">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Current Total</span>
            <span className="text-white font-mono">$362.99</span>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-accent-purple h-full w-[72%]"></div>
          </div>
          <div className="text-[10px] text-right text-gray-500 mt-1 font-mono">72% of $500 Budget</div>
        </div>
      </aside>
    </main>
    </>
  )
}
