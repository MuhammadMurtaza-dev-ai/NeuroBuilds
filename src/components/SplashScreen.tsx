import { useState, useEffect } from 'react'

type Phase = 'enter' | 'idle' | 'exit'

export default function SplashScreen() {
  const [phase, setPhase] = useState<Phase>('enter')
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    // entrance animation runs for 300ms, then hold until 500ms, then exit
    const idleTimer  = setTimeout(() => setPhase('idle'), 300)
    const exitTimer  = setTimeout(() => setPhase('exit'), 500)
    const unmount    = setTimeout(() => setMounted(false), 860)
    return () => {
      clearTimeout(idleTimer)
      clearTimeout(exitTimer)
      clearTimeout(unmount)
    }
  }, [])

  if (!mounted) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(ellipse at 25% 50%, rgba(13,242,242,0.18) 0%, transparent 55%),' +
          'radial-gradient(ellipse at 75% 50%, rgba(191,0,255,0.18) 0%, transparent 55%),' +
          '#0d0e12',
        animation: phase === 'exit' ? 'splashOverlayOut 360ms ease-out forwards' : undefined,
        pointerEvents: phase === 'exit' ? 'none' : 'auto',
      }}
    >
      {/* outer glow ring — fades in with icon */}
      <div
        style={{
          position: 'absolute',
          width: 160,
          height: 160,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(13,242,242,0.12) 0%, rgba(191,0,255,0.08) 50%, transparent 70%)',
          animation:
            phase === 'enter'
              ? 'splashRingEnter 300ms ease-out forwards'
              : phase === 'exit'
              ? 'splashRingPop 360ms ease-in forwards'
              : undefined,
        }}
      />

      <img
        src="/favicon.png"
        alt=""
        draggable={false}
        style={{
          width: 88,
          height: 88,
          userSelect: 'none',
          filter:
            'drop-shadow(0 0 18px rgba(13,242,242,0.9)) drop-shadow(0 0 36px rgba(191,0,255,0.55))',
          animation:
            phase === 'enter'
              ? 'splashIconEnter 300ms cubic-bezier(0.34,1.56,0.64,1) forwards'
              : phase === 'exit'
              ? 'splashIconPop 360ms ease-in forwards'
              : undefined,
        }}
      />
    </div>
  )
}
