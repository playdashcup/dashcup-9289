'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { GameInputEvidence, StartGameResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Gamepad2, Play, ShieldCheck, Trophy, RotateCcw } from 'lucide-react'

const GAME_ORIGIN = process.env.NEXT_PUBLIC_GAME_ORIGIN ?? 'http://localhost:8787'

type GameState = 'idle' | 'starting' | 'playing' | 'finishing' | 'complete' | 'error'

export function GameBridge({ onComplete }: { onComplete: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [state, setState] = useState<GameState>('idle')
  const [run, setRun] = useState<StartGameResponse | null>(null)
  const [inputs, setInputs] = useState<GameInputEvidence[]>([])
  const [result, setResult] = useState<{ score: number; trophies: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== GAME_ORIGIN || event.source !== iframeRef.current?.contentWindow || typeof event.data?.type !== 'string') return
      if (event.data.type === 'dashcup:ready' && run) iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:start', ...run }, GAME_ORIGIN)
      if (event.data.type === 'dashcup:run_started') setState('playing')
      if (event.data.type === 'dashcup:run_finished' && run && event.data.runId === run.runId) {
        setState('finishing')
        try {
          const response = await api.endGame({ runId: run.runId, runToken: run.runToken, clientScore: Number(event.data.clientScore) || 0, durationMs: Number(event.data.durationMs) || 0, inputs })
          setResult({ score: response.verifiedScore, trophies: response.trophiesEarned }); setState('complete'); setRun(null); onComplete()
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Run verification failed'); setState('error') }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [inputs, onComplete, run])

  const start = async () => {
    setError(null); setResult(null); setState('starting'); setInputs([])
    try {
      const newRun = await api.startGame(); setRun(newRun); setState('playing')
      iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:start', ...newRun }, GAME_ORIGIN)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start a verified run'); setState('error') }
  }

  return <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300"><Gamepad2 className="size-5" /></div><div><h2 className="font-bold text-white">Arcade run</h2><p className="text-xs text-zinc-500">Verified play. Real rewards.</p></div></div><span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300"><ShieldCheck className="size-3.5" /> Server verified</span></div><div className="relative aspect-[16/10] min-h-[300px] bg-[#050609] sm:aspect-video"><iframe ref={iframeRef} src={GAME_ORIGIN} title="DASHCUP game" className="size-full border-0" allow="autoplay; fullscreen" /><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(5,6,9,.3))]" />{state !== 'playing' && state !== 'finishing' && <div className="absolute inset-0 grid place-items-center bg-[#050609]/70 p-6 text-center backdrop-blur-[2px]"><div><div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-300"><Play className="ml-1 size-7 fill-current" /></div><p className="mb-4 text-sm text-zinc-400">{state === 'complete' ? 'Run verified. Ready for another?' : 'Press play when you are ready to run.'}</p><Button onClick={start} disabled={state === 'starting'} className="h-12 rounded-xl bg-cyan-300 px-8 font-black text-zinc-950 hover:bg-cyan-200">{state === 'starting' ? 'Starting…' : state === 'complete' ? <><RotateCcw data-icon="inline-start" /> PLAY AGAIN</> : 'PLAY NOW'}</Button>{error && <p className="mt-3 text-xs text-red-300">{error}</p>}</div></div>}</div>{result && <div className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 bg-emerald-300/[0.06] px-5 py-4"><div><p className="text-xs text-zinc-500">Verified score</p><p className="mt-1 font-mono text-xl font-bold text-white">{result.score.toLocaleString()}</p></div><div className="pl-5"><p className="text-xs text-zinc-500">Trophies earned</p><p className="mt-1 flex items-center gap-1.5 font-mono text-xl font-bold text-yellow-200"><Trophy className="size-4" /> +{result.trophies.toLocaleString()}</p></div></div>}</section>
}
