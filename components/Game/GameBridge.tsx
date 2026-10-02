'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { GameInputEvidence, StartGameResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Gamepad2, Play, RotateCcw } from 'lucide-react'

const GAME_ORIGIN = process.env.NEXT_PUBLIC_GAME_ORIGIN || (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : 'https://game.dashcup.com')

type GameState = 'idle' | 'starting' | 'playing' | 'finishing' | 'complete' | 'error'

export function GameBridge({ onComplete }: { onComplete: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const gameReady = useRef(false)
  const [state, setState] = useState<GameState>('idle')
  const [run, setRun] = useState<StartGameResponse | null>(null)
  const [inputs, setInputs] = useState<GameInputEvidence[]>([])
  const [result, setResult] = useState<{ score: number; trophies: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== GAME_ORIGIN || event.source !== iframeRef.current?.contentWindow || typeof event.data?.type !== 'string') return
      if (event.data.type === 'dashcup:input' && run && event.data.runId === run.runId) {
        const evidence = event.data.input as GameInputEvidence
        const validKeys = ['SWIPE_UP', 'SWIPE_DOWN', 'SWIPE_LEFT', 'SWIPE_RIGHT']
        if (inputs.length < 2000 && evidence?.type === 'move' && validKeys.includes(String(evidence.key)) && Number.isInteger(evidence.at) && evidence.at >= 0 && evidence.at <= 180_000) {
          const safeEvidence: GameInputEvidence = { type: 'move', key: evidence.key, at: evidence.at }
          setInputs((current) => current.length < 2000 ? [...current, safeEvidence] : current)
        }
      }
      if (event.data.type === 'dashcup:ready') {
        gameReady.current = true
        if (run) iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:start', ...run }, GAME_ORIGIN)
      }
      if (event.data.type === 'dashcup:run_started' && run && event.data.runId === run.runId) setState('playing')
      if (event.data.type === 'dashcup:run_finished' && run && event.data.runId === run.runId) {
        setState('finishing')
        try {
          const response = await api.endGame({ runId: run.runId, runToken: run.runToken, clientScore: Number(event.data.clientScore) || 0, durationMs: Number(event.data.durationMs) || 0, inputs })
          if (response.verification === 'verified' && response.awarded) setResult({ score: response.score ?? 0, trophies: response.trophiesEarned })
          setState('complete'); setRun(null); onComplete()
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Run verification failed'); setState('error') }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [inputs, onComplete, run])

  const start = async () => {
    setError(null); setResult(null); setState('starting'); setInputs([])
    try {
      const newRun = await api.startGame(); setRun(newRun)
      if (gameReady.current) iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:start', ...newRun }, GAME_ORIGIN)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start a verified run'); setState('error') }
  }

  return <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300"><Gamepad2 className="size-5" /></div><div><h2 className="font-bold text-white">ChickenDash</h2><p className="text-xs text-zinc-500">Scoreboard stays visible; game trophies await verified replay.</p></div></div><span className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Replay verification pending</span></div><div className="relative aspect-[4/3] min-h-[260px] bg-[#050609] sm:aspect-video sm:min-h-[300px]"><iframe ref={iframeRef} src={`${GAME_ORIGIN}/?parentOrigin=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.origin)}`} title="ChickenDash" className="size-full border-0" allow="autoplay; fullscreen" /><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(5,6,9,.3))]" />{state !== 'playing' && state !== 'finishing' && <div className="absolute inset-0 grid place-items-center bg-[#050609]/70 p-6 text-center backdrop-blur-[2px]"><div><div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-300"><Play className="ml-1 size-7 fill-current" /></div><p className="mb-4 text-sm text-zinc-400">{state === 'complete' ? 'Run recorded for review. No unverified score or trophies were awarded.' : 'Ready to cross?'}</p><div className="flex flex-wrap justify-center gap-2"><Button onClick={start} disabled={state === 'starting'} className="h-12 rounded-xl bg-cyan-300 px-6 font-black text-zinc-950 hover:bg-cyan-200">{state === 'starting' ? 'Starting…' : state === 'complete' ? <><RotateCcw data-icon="inline-start" /> RESTART</> : 'START'}</Button><Button disabled title="Rewards are unavailable until a real SDK and trusted server verification are configured" variant="outline" className="h-12 rounded-xl border-white/15 bg-white/5 px-5 font-bold text-zinc-300 disabled:opacity-60">Reward Ad · 5× (Unavailable)</Button></div>{error && <p className="mt-3 text-xs text-red-300">{error}</p>}</div></div>}</div></section>
}
