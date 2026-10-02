'use client'

import { useLayoutEffect, useRef, useState } from 'react'
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
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [state, setState] = useState<GameState>('idle')
  const [error, setError] = useState<string | null>(null)

  useLayoutEffect(() => {
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
      if (event.data.type === 'dashcup:run_started' && activeRun && event.data.runId === activeRun.runId) {
        if (startTimerRef.current) clearTimeout(startTimerRef.current)
        startTimerRef.current = null
        setError(null)
        setState('playing')
      }
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
    return () => {
      window.removeEventListener('message', onMessage)
      if (startTimerRef.current) clearTimeout(startTimerRef.current)
    }
  }, [onComplete])

  const start = async () => {
    setError(null); setState('starting'); inputsRef.current = []; runRef.current = null; finishingRunRef.current = null
    try {
      const newRun = await api.startGame(); runRef.current = newRun
      if (gameReady.current) iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:start', ...newRun }, GAME_ORIGIN)
      if (!gameReady.current) {
        startTimerRef.current = setTimeout(() => {
          if (runRef.current?.runId === newRun.runId && state !== 'playing') {
            setError('ChickenDash is still loading. Refresh the page and try again.')
            setState('error')
          }
        }, 10_000)
      }
    } catch (cause) { if (startTimerRef.current) clearTimeout(startTimerRef.current); setError(cause instanceof Error ? cause.message : 'Could not start a verified run'); setState('error') }
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border-[3px] border-[#78eaff] bg-gradient-to-br from-[#252b59] via-[#171c43] to-[#292052] shadow-[0_12px_0_#090d22,0_24px_55px_rgba(4,7,24,.45)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-white/10 bg-white/[0.045] px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl border-2 border-[#192047] bg-gradient-to-br from-[#8df7ff] to-[#45cfe9] text-[#182044] shadow-[0_4px_0_#278ca8]"><Gamepad2 className="size-5" /></div>
          <div><h2 className="text-lg font-black uppercase tracking-wide text-white [text-shadow:0_2px_0_rgba(4,9,35,.7)]">ChickenDash</h2><p className="text-xs text-indigo-100/70">Cross the road. Chase your best.</p></div>
        </div>
        <span className="rounded-full border-2 border-[#354065] bg-[#b9ff69]/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#c9ff87] shadow-[0_3px_0_#101832]">Evidence checks active</span>
      </div>
      <div className="relative aspect-[4/3] min-h-[260px] bg-[#080c24] p-2 sm:aspect-video sm:min-h-[300px] sm:p-3">
        <div className="absolute inset-2 overflow-hidden rounded-2xl border-[3px] border-[#111735] bg-[#050609] shadow-[inset_0_0_0_2px_rgba(255,255,255,.08),0_5px_0_#090d20] sm:inset-3">
          <iframe ref={iframeRef} src={`${GAME_ORIGIN}/?parentOrigin=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.origin)}`} title="ChickenDash" className="size-full border-0" allow="autoplay; fullscreen" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(5,6,9,.3))]" />
        </div>
        {state !== 'playing' && state !== 'finishing' && <div className="absolute inset-2 z-10 grid place-items-center rounded-2xl bg-[#111633]/80 p-6 text-center backdrop-blur-[2px] sm:inset-3">
          <div>
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-[1.35rem] border-[3px] border-[#111735] bg-gradient-to-br from-[#ff94d4] to-[#f454b3] text-[#32154a] shadow-[0_6px_0_#a9317a,0_10px_20px_rgba(0,0,0,.3)]"><Play className="ml-1 size-7 fill-current" /></div>
            <p className="mb-5 text-sm font-semibold text-indigo-100">{state === 'complete' ? 'Run checked! Ready for another round?' : 'Ready to cross?'}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={start} disabled={state === 'starting'} className="h-12 rounded-2xl border-[3px] border-[#13213d] bg-gradient-to-b from-[#b9ff70] to-[#81e849] px-7 font-black uppercase tracking-wide text-[#18233a] shadow-[0_5px_0_#397e39] transition hover:-translate-y-0.5 hover:from-[#d0ff98] hover:to-[#96f45d] hover:shadow-[0_7px_0_#397e39] active:translate-y-1 active:shadow-[0_2px_0_#397e39] disabled:opacity-70">{state === 'starting' ? 'Starting…' : state === 'complete' ? <><RotateCcw data-icon="inline-start" /> RESTART</> : 'START'}</Button>
              <Button disabled title="Rewards are unavailable until a real SDK and trusted server verification are configured" variant="outline" className="h-12 rounded-2xl border-[3px] border-[#392154] bg-gradient-to-b from-[#ffb4e3] to-[#f27ac5] px-5 font-black uppercase tracking-wide text-[#38153d] shadow-[0_5px_0_#9d3c83] disabled:cursor-not-allowed disabled:opacity-75">5x Reward</Button>
            </div>
            {error && <p role="alert" className="mx-auto mt-4 max-w-sm rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-100">{error}</p>}
          </div>
        </div>}
      </div>
    </section>
  )
}
