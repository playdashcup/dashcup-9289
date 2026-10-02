'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { EndGameResponse, GameInputEvidence, StartGameResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Gamepad2, Play, RotateCcw } from 'lucide-react'

const GAME_ORIGIN = process.env.NEXT_PUBLIC_GAME_ORIGIN || (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : 'https://game.dashcup.com')

type GameState = 'idle' | 'starting' | 'playing' | 'finishing' | 'complete' | 'error'

export function GameBridge({ onComplete }: { onComplete: (state?: EndGameResponse['state']) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const gameReady = useRef(false)
  const runRef = useRef<StartGameResponse | null>(null)
  const inputsRef = useRef<GameInputEvidence[]>([])
  const finishingRunRef = useRef<string | null>(null)
  const [state, setState] = useState<GameState>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== GAME_ORIGIN || event.source !== iframeRef.current?.contentWindow || typeof event.data?.type !== 'string') return
      const activeRun = runRef.current
      if (event.data.type === 'dashcup:input' && activeRun && event.data.runId === activeRun.runId) {
        const evidence = event.data.input as GameInputEvidence
        const validKeys = ['SWIPE_UP', 'SWIPE_DOWN', 'SWIPE_LEFT', 'SWIPE_RIGHT']
        if (inputsRef.current.length < 2000 && evidence?.type === 'move' && validKeys.includes(String(evidence.key)) && Number.isInteger(evidence.at) && evidence.at >= 0 && evidence.at <= 180_000) {
          const safeEvidence: GameInputEvidence = { type: 'move', key: evidence.key, at: evidence.at }
          inputsRef.current.push(safeEvidence)
        }
      }
      if (event.data.type === 'dashcup:ready') {
        gameReady.current = true
        if (activeRun) iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:start', ...activeRun }, GAME_ORIGIN)
      }
      if (event.data.type === 'dashcup:run_started' && activeRun && event.data.runId === activeRun.runId) setState('playing')
      if (event.data.type === 'dashcup:run_finished' && activeRun && event.data.runId === activeRun.runId && finishingRunRef.current !== activeRun.runId) {
        finishingRunRef.current = activeRun.runId
        setState('finishing')
        try {
          // Read the ref only after all earlier postMessage input events have been processed.
          const result = await api.endGame({ runId: activeRun.runId, runToken: activeRun.runToken, clientScore: Number(event.data.clientScore) || 0, durationMs: Number(event.data.durationMs) || 0, inputs: inputsRef.current.slice() })
          runRef.current = null; setState('complete'); onComplete(result.state)
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Run verification failed'); setState('error') }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onComplete])

  const start = async () => {
    setError(null); setState('starting'); inputsRef.current = []; runRef.current = null; finishingRunRef.current = null
    try {
      const newRun = await api.startGame(); runRef.current = newRun
      if (gameReady.current) iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:start', ...newRun }, GAME_ORIGIN)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start a verified run'); setState('error') }
  }

  return <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300"><Gamepad2 className="size-5" /></div><div><h2 className="font-bold text-white">ChickenDash</h2><p className="text-xs text-zinc-500">Scoreboard stays visible; each run gets practical evidence checks.</p></div></div><span className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Evidence checks active</span></div><div className="relative aspect-[4/3] min-h-[260px] bg-[#050609] sm:aspect-video sm:min-h-[300px]"><iframe ref={iframeRef} src={`${GAME_ORIGIN}/?parentOrigin=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.origin)}`} title="ChickenDash" className="size-full border-0" allow="autoplay; fullscreen" /><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(5,6,9,.3))]" />{state !== 'playing' && state !== 'finishing' && <div className="absolute inset-0 grid place-items-center bg-[#050609]/70 p-6 text-center backdrop-blur-[2px]"><div><div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-300"><Play className="ml-1 size-7 fill-current" /></div><p className="mb-4 text-sm text-zinc-400">{state === 'complete' ? 'Run recorded after evidence checks. Client input cannot grant ad rewards.' : 'Ready to cross?'}</p><div className="flex flex-wrap justify-center gap-2"><Button onClick={start} disabled={state === 'starting'} className="h-12 rounded-xl bg-cyan-300 px-6 font-black text-zinc-950 hover:bg-cyan-200">{state === 'starting' ? 'Starting…' : state === 'complete' ? <><RotateCcw data-icon="inline-start" /> RESTART</> : 'START'}</Button><Button disabled title="Rewards are unavailable until a real SDK and trusted server verification are configured" variant="outline" className="h-12 rounded-xl border-white/15 bg-white/5 px-5 font-bold text-zinc-300 disabled:opacity-60">5x Reward</Button></div>{error && <p className="mt-3 text-xs text-red-300">{error}</p>}</div></div>}</div></section>
}
