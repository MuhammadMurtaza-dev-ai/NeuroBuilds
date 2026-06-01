import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[NeuroBuilds] Uncaught runtime error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center p-8">
        <div className="glass-panel rounded-bento p-10 max-w-2xl w-full border border-amber-500/30 shadow-[0_0_40px_rgba(245,158,11,0.15)]">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-4xl text-amber-400 select-none">⚠</span>
            <div>
              <p className="text-xs font-mono text-amber-400/60 uppercase tracking-[0.2em] mb-1">
                System Status: CONTAINED
              </p>
              <h1 className="text-2xl font-bold text-amber-400 tracking-tight font-mono">
                CRITICAL SYSTEM FAULT RESOLVED
              </h1>
            </div>
          </div>

          <p className="text-gray-400 font-mono text-sm leading-relaxed mb-6">
            Core sub-routines safely sandboxed. All user data is intact.
            An unexpected runtime exception was caught and quarantined.
          </p>

          {this.state.error && (
            <pre className="bg-black/60 rounded-xl p-4 text-xs text-red-400/80 font-mono overflow-auto max-h-32 mb-6 border border-red-900/30 whitespace-pre-wrap break-all">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { window.location.href = '/' }}
              className="px-6 py-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 hover:border-amber-500/70 text-amber-400 font-bold font-mono text-sm transition-all"
            >
              &gt;_ RETURN TO BASE
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 font-mono text-sm transition-all"
            >
              RETRY
            </button>
          </div>
        </div>
      </div>
    )
  }
}
