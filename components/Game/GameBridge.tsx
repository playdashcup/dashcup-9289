'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { EndGameResponse, GameInputEvidence, StartGameResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { HilltopVastAd } from '@/components/ads/HilltopVastAd'
import { Gamepad2, Play, RotateCcw } from 'lucide-react'

const GAME_ORIGIN = process.env.NEXT_PUBLIC_GAME_ORIGIN || (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : 'https://game.dashcup.com')
const COMPLETED_RUNS_STORAGE_KEY = 'dashcup.hilltop-vast.completed-runs.v1'
const CLIENT_SIGNAL_WEIGHTS: Record<string, number> = {
  input_burst: 24, score_velocity: 28, short_run_high_score: 24, movement_jump: 30,
  invalid_state_transition: 20, state_integrity: 30, focus_change: 2,
  devtools_shortcut: 3, rapid_reset: 12, input_count_mismatch: 12,
}

function safeClientSignals(value: unknown, actualInputCount: number, extraFlags: Set<string>) {
  const telemetry = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const flags = new Set<string>([...extraFlags].filter((flag) => flag in CLIENT_SIGNAL_WEIGHTS))
  if (Array.isArray(telemetry.flags)) {
    for (const flag of telemetry.flags.slice(0, 10)) {
      if (typeof flag === 'string' && flag in CLIENT_SIGNAL_WEIGHTS) flags.add(flag)
    }
  }
  if (Number.isInteger(telemetry.inputCount) && telemetry.inputCount !== actualInputCount) flags.add('input_count_mismatch')
  const suspicionScore = [...flags].reduce((sum, flag) => sum + CLIENT_SIGNAL_WEIGHTS[flag], 0)
  const focusChanges = Number.isInteger(telemetry.focusChanges) ? Math.max(0, Math.min(100, Number(telemetry.focusChanges))) : 0
  return {
    suspicionScore: Math.min(100, suspicionScore),
    flags: [...flags],
    inputCount: actualInputCount,
    focusChanges,
  }
}

type GameState = 'idle' | 'starting' | 'playing' | 'finishing' | 'complete' | 'error'

export function GameBridge({ onComplete }: { onComplete: (result: EndGameResponse) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const gameReady = useRef(false)
  const runRef = useRef<StartGameResponse | null>(null)
  const inputsRef = useRef<GameInputEvidence[]>([])
  const finishingRunRef = useRef<string | null>(null)
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readyPingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const acknowledgedRunRef = useRef<string | null>(null)
  const [state, setState] = useState<GameState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ score: number; trophies: number } | null>(null)
  const [vastAdAttempt, setVastAdAttempt] = useState<number | null>(null)
  const completedRunsRef = useRef(0)
  const runStartTimesRef = useRef<number[]>([])
  const pendingRunSignalsRef = useRef<Set<string>>(new Set())
  const runSignalsRef = useRef<Set<string>>(new Set())

  const recordCompletedRun = () => {
    let storedCount = 0
    try {
      const stored = localStorage.getItem(COMPLETED_RUNS_STORAGE_KEY)
      if (stored && /^\d+$/.test(stored)) {
        const parsed = Number(stored)
        if (Number.isSafeInteger(parsed)) storedCount = parsed
      }
    } catch { /* Storage can be unavailable in private browsing; use this page session. */ }
    const nextCount = Math.max(storedCount, completedRunsRef.current) + 1
    completedRunsRef.current = nextCount
    try { localStorage.setItem(COMPLETED_RUNS_STORAGE_KEY, String(nextCount)) } catch { /* The frequency counter is a non-authoritative ad preference. */ }
    if (nextCount % 10 === 0) setVastAdAttempt(nextCount)
  }

  const clearHandshake = () => {
    if (startTimerRef.current) clearTimeout(startTimerRef.current)
    if (readyPingTimerRef.current) clearInterval(readyPingTimerRef.current)
    startTimerRef.current = null
    readyPingTimerRef.current = null
  }

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
        if (activeRun && acknowledgedRunRef.current !== activeRun.runId) {
          iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:start', ...activeRun }, GAME_ORIGIN)
        }
      }
      if (event.data.type === 'dashcup:run_started' && activeRun && event.data.runId === activeRun.runId) {
        acknowledgedRunRef.current = activeRun.runId
        clearHandshake()
        setError(null)
        setState('playing')
      }
      if (event.data.type === 'dashcup:run_start_error' && activeRun && event.data.runId === activeRun.runId) {
        runRef.current = null
        clearHandshake()
        setError('ChickenDash could not initialize. Reload the game and try again.')
        setState('error')
      }
      if (event.data.type === 'dashcup:run_finished' && activeRun && event.data.runId === activeRun.runId && finishingRunRef.current !== activeRun.runId) {
        finishingRunRef.current = activeRun.runId
        // Ad pacing follows completed gameplay, even if the network is offline
        // or server evidence checks reject the score. It never grants rewards.
        recordCompletedRun()
        setState('finishing')
        try {
          // Read the ref only after all earlier postMessage input events have been processed.
          const result = await api.endGame({ runId: activeRun.runId, runToken: activeRun.runToken, clientScore: Number(event.data.clientScore) || 0, durationMs: Number(event.data.durationMs) || 0, inputs: inputsRef.current.slice(), clientSignals: safeClientSignals(event.data.clientSignals, inputsRef.current.length, runSignalsRef.current) })
          runRef.current = null
          setResult({ score: result.score ?? 0, trophies: result.trophiesEarned })
          setState('complete')
          onComplete(result)
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Run checks failed'); setState('error') }
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      clearHandshake()
    }
  }, [onComplete])

  useLayoutEffect(() => {
    if (state !== 'playing') return
    const directions: Record<string, string> = {
      ArrowUp: 'SWIPE_UP',
      ArrowDown: 'SWIPE_DOWN',
      ArrowLeft: 'SWIPE_LEFT',
      ArrowRight: 'SWIPE_RIGHT',
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const key = directions[event.key]
      if (runRef.current && ((event.key === 'F12') || ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(event.key.toLowerCase())) || (event.metaKey && event.altKey && ['i', 'j', 'c'].includes(event.key.toLowerCase())))) {
        runSignalsRef.current.add('devtools_shortcut')
      }
      if (!key || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      event.preventDefault()
      if (event.repeat) return
      iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:move', key }, GAME_ORIGIN)
    }
    window.addEventListener('keydown', onKeyDown)
    const onFocusChange = () => { if (runRef.current) runSignalsRef.current.add('focus_change') }
    const onVisibilityChange = () => { if (document.visibilityState !== 'visible' && runRef.current) runSignalsRef.current.add('focus_change') }
    window.addEventListener('blur', onFocusChange)
    window.addEventListener('focus', onFocusChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onFocusChange)
      window.removeEventListener('focus', onFocusChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [state])

  const start = async () => {
    setError(null); setResult(null); setState('starting'); inputsRef.current = []; runRef.current = null; finishingRunRef.current = null; acknowledgedRunRef.current = null; clearHandshake()
    const now = performance.now()
    runStartTimesRef.current = runStartTimesRef.current.filter((startedAt) => now - startedAt < 8_000)
    runStartTimesRef.current.push(now)
    pendingRunSignalsRef.current = new Set(runStartTimesRef.current.length >= 4 ? ['rapid_reset'] : [])
    try {
      const newRun = await api.startGame(); runRef.current = newRun; runSignalsRef.current = new Set(pendingRunSignalsRef.current)
      const sendStart = () => {
        if (gameReady.current && acknowledgedRunRef.current !== newRun.runId) {
          iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:start', ...newRun }, GAME_ORIGIN)
        } else if (!gameReady.current) {
          iframeRef.current?.contentWindow?.postMessage({ type: 'dashcup:ping' }, GAME_ORIGIN)
        }
      }
      sendStart()
      readyPingTimerRef.current = setInterval(sendStart, 300)
      startTimerRef.current = setTimeout(() => {
        if (runRef.current?.runId === newRun.runId) {
          runRef.current = null
          clearHandshake()
          setError('ChickenDash did not respond. Check your connection and try again.')
          setState('error')
        }
      }, 12_000)
    } catch (cause) { clearHandshake(); setError(cause instanceof Error ? cause.message : 'Could not start a run'); setState('error') }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-[2rem] border-[3px] border-[#78eaff] bg-gradient-to-br from-[#252b59] via-[#171c43] to-[#292052] shadow-[0_12px_0_#090d22,0_24px_55px_rgba(4,7,24,.45)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-white/10 bg-white/[0.045] px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl border-2 border-[#192047] bg-gradient-to-br from-[#8df7ff] to-[#45cfe9] text-[#182044] shadow-[0_4px_0_#278ca8]"><Gamepad2 className="size-5" /></div>
          <div><h2 className="text-lg font-black uppercase tracking-wide text-white [text-shadow:0_2px_0_rgba(4,9,35,.7)]">ChickenDash</h2><p className="text-xs text-indigo-100/70">Arrow keys or swipe to move.</p></div>
        </div>
        <span className="rounded-full border-2 border-[#354065] bg-[#b9ff69]/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#c9ff87] shadow-[0_3px_0_#101832]">Evidence checks active</span>
      </div>
      <div className="relative mx-auto aspect-[3/4] w-full bg-[#080c24] p-2 sm:aspect-[4/3] sm:p-3">
        <div className="absolute inset-2 overflow-hidden rounded-2xl border-[3px] border-[#111735] bg-[#050609] shadow-[inset_0_0_0_2px_rgba(255,255,255,.08),0_5px_0_#090d20] sm:inset-3">
          <iframe ref={iframeRef} src={`${GAME_ORIGIN}/?parentOrigin=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.origin)}`} title="ChickenDash" className="size-full border-0" allow="autoplay; fullscreen" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(5,6,9,.3))]" />
        </div>
        {state !== 'playing' && state !== 'finishing' && <div className="absolute inset-2 z-10 grid place-items-center rounded-2xl bg-[#111633]/80 p-6 text-center backdrop-blur-[2px] sm:inset-3">
          <div>
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-[1.35rem] border-[3px] border-[#111735] bg-gradient-to-br from-[#ff94d4] to-[#f454b3] text-[#32154a] shadow-[0_6px_0_#a9317a,0_10px_20px_rgba(0,0,0,.3)]"><Play className="ml-1 size-7 fill-current" /></div>
            {state === 'complete' ? <div className="mb-5"><p className="text-lg font-black uppercase text-white">Run over</p><p className="mt-1 text-sm text-indigo-100">Score <strong className="text-[#c9ff87]">{result?.score.toLocaleString() ?? '0'}</strong><span className="mx-2 text-white/30">·</span><strong className="text-yellow-200">+{result?.trophies.toLocaleString() ?? '0'} trophies</strong></p></div> : <p className="mb-5 text-sm font-semibold text-indigo-100">{state === 'error' ? 'Ready to try again?' : 'Ready to cross?'}</p>}
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={start} disabled={state === 'starting'} className="h-12 rounded-2xl border-[3px] border-[#13213d] bg-gradient-to-b from-[#b9ff70] to-[#81e849] px-7 font-black uppercase tracking-wide text-[#18233a] shadow-[0_5px_0_#397e39] transition hover:-translate-y-0.5 hover:from-[#d0ff98] hover:to-[#96f45d] hover:shadow-[0_7px_0_#397e39] active:translate-y-1 active:shadow-[0_2px_0_#397e39] disabled:opacity-70">{state === 'starting' ? 'Starting…' : state === 'complete' ? <><RotateCcw data-icon="inline-start" /> RETRY</> : state === 'error' ? 'TRY AGAIN' : 'START'}</Button>
              {state === 'complete' && <Button disabled title="Rewarded ads are unavailable until a real SDK and trusted completion verification are configured" variant="outline" className="h-12 rounded-2xl border-[3px] border-[#392154] bg-gradient-to-b from-[#ffb4e3] to-[#f27ac5] px-5 font-black uppercase tracking-wide text-[#38153d] shadow-[0_5px_0_#9d3c83] disabled:cursor-not-allowed disabled:opacity-75">5x Reward</Button>}
            </div>
            {error && <p role="alert" className="mx-auto mt-4 max-w-sm rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-100">{error}</p>}
          </div>
        </div>}
        {vastAdAttempt !== null && <HilltopVastAd key={vastAdAttempt} attempt={vastAdAttempt} onClose={() => setVastAdAttempt(null)} />}
      </div>
    </section>
  )
}
