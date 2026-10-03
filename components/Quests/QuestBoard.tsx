'use client'

import { useRef, useState } from 'react'
import type { Quest } from '@/lib/types'
import { api } from '@/lib/api'
import { Trophy, Check, Loader2, Target, Sparkles } from 'lucide-react'

type ClaimAudioContext = AudioContext

function prepareClaimSound(): ClaimAudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const BrowserAudioContext = window.AudioContext
    if (!BrowserAudioContext) return null
    const context = new BrowserAudioContext()
    void context.resume()
    return context
  } catch {
    return null
  }
}

function playClaimSound(context: ClaimAudioContext | null) {
  if (!context || context.state === 'closed') return
  const notes = [523.25, 659.25, 783.99, 1046.5]
  const startAt = context.currentTime + 0.015
  for (const [index, frequency] of notes.entries()) {
    const start = startAt + index * 0.085
    const oscillator = context.createOscillator()
    const volume = context.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(frequency, start)
    volume.gain.setValueAtTime(0.0001, start)
    volume.gain.exponentialRampToValueAtTime(0.075, start + 0.018)
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.24)
    oscillator.connect(volume)
    volume.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.25)
  }
  window.setTimeout(() => { void context.close() }, 900)
}

export function QuestBoard({ quests, onClaimed }: { quests: Quest[] | null; onClaimed: (result: Awaited<ReturnType<typeof api.claimQuest>>) => void }) {
  const [claiming, setClaiming] = useState<string | null>(null)
  const [startingOffer, setStartingOffer] = useState<string | null>(null)
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const claim = async (id: string) => {
    const sound = prepareClaimSound()
    setClaiming(id)
    setMessage(null)
    try {
      const result = await api.claimQuest(id)
      onClaimed(result)
      setCelebrating(id)
      playClaimSound(sound)
      setMessage(`+${result.trophiesAwarded.toLocaleString()} trophies added`)
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current)
      celebrationTimer.current = setTimeout(() => setCelebrating(null), 1_250)
    } catch (cause) {
      if (sound && sound.state !== 'closed') void sound.close()
      setMessage(cause instanceof Error ? cause.message : 'Unable to claim quest')
    } finally {
      setClaiming(null)
    }
  }

  const startOffer = async (offerId: string) => {
    setStartingOffer(offerId)
    setMessage(null)
    try {
      const result = await api.startSponsorOffer(offerId)
      window.location.assign(result.url)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'This sponsor offer could not be opened.')
      setStartingOffer(null)
    }
  }

  if (!quests) return <PanelMessage label="Loading quests…" />
  const daily = quests.filter((quest) => quest.period === 'daily')
  const weekly = quests.filter((quest) => quest.period === 'weekly')

  return <div className="space-y-7">
    <div className="flex items-end justify-between gap-3">
      <div><p className="font-mono text-xs uppercase tracking-[.2em] text-cyan-300">Missions</p><h2 className="mt-1 text-2xl font-black text-white">Quest board</h2></div>
      {message && <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-right text-xs font-bold text-emerald-200"><Sparkles className="size-4 text-yellow-200" />{message}</p>}
    </div>
    <QuestGroup title="Daily quests" quests={daily} claiming={claiming} startingOffer={startingOffer} celebrating={celebrating} onClaim={claim} onStartOffer={startOffer} />
    <QuestGroup title="Weekly quests" quests={weekly} claiming={claiming} startingOffer={startingOffer} celebrating={celebrating} onClaim={claim} onStartOffer={startOffer} />
  </div>
}

function QuestGroup({ title, quests, claiming, startingOffer, celebrating, onClaim, onStartOffer }: { title: string; quests: Quest[]; claiming: string | null; startingOffer: string | null; celebrating: string | null; onClaim: (id: string) => void; onStartOffer: (id: string) => void }) {
  return <section>
    <div className="mb-3 flex items-center gap-2"><Target className="size-4 text-cyan-300" /><h3 className="font-bold text-white">{title}</h3><span className="text-xs text-zinc-600">{quests.length} available</span></div>
    {quests.length === 0 ? <PanelMessage label="No quests available right now." /> : <div className="grid gap-3 md:grid-cols-2">{quests.map((quest) => {
      const isCelebrating = celebrating === quest.id
      return <article key={quest.id} className={`rounded-2xl border bg-white/[0.035] p-4 transition hover:border-white/20 ${isCelebrating ? 'quest-claim-celebrate border-yellow-200/70' : 'border-white/10'}`}>
        <div className="flex items-start justify-between gap-4"><div><h4 className="font-bold text-white">{quest.title}</h4><p className="mt-1 text-xs text-zinc-500">{quest.description ?? 'Complete this mission to earn trophies.'}</p></div><span className={`flex shrink-0 items-center gap-1 rounded-full bg-yellow-300/10 px-2 py-1 font-mono text-xs font-bold text-yellow-200 ${isCelebrating ? 'quest-trophy-pop' : ''}`}><Trophy className="size-3" /> +{quest.reward.toLocaleString()}</span></div>
        <div className="mt-5"><div className="mb-2 flex justify-between font-mono text-xs text-zinc-500"><span>{quest.completed ? 'Completed' : 'In progress'}</span><span>{quest.progress} / {quest.target}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${Math.min(100, quest.target ? quest.progress / quest.target * 100 : 0)}%` }} /></div></div>
        {quest.type === 'sponsor_app' && !quest.completed && <div className="mt-4 space-y-2">
          {quest.sponsorOffers?.length ? quest.sponsorOffers.map((offer) => <div key={offer.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-white">{offer.title}</span><span className="rounded-full bg-cyan-300/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-200">{offer.type}</span></div><p className="mt-1 text-xs text-zinc-400">{offer.action}</p></div>
            <button onClick={() => onStartOffer(offer.id)} disabled={startingOffer !== null} className="shrink-0 rounded-xl border-2 border-[#173a2b] bg-gradient-to-b from-lime-300 to-emerald-400 px-5 py-2 text-xs font-black text-[#102a1c] shadow-[0_3px_0_#28794d] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0.5 active:shadow-none disabled:opacity-60">{startingOffer === offer.id ? <Loader2 className="size-4 animate-spin" /> : 'GO!'}</button>
          </div>) : <p className="rounded-xl border border-white/10 bg-black/15 p-3 text-xs text-zinc-500">No sponsor offers are currently available for your location or device.</p>}
        </div>}
        {quest.completed && <div className="mt-4 flex items-center justify-between">{quest.claimed ? <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-300"><Check className="size-4" /> Claimed</span> : <button onClick={() => onClaim(quest.id)} disabled={claiming === quest.id} className="rounded-xl border-2 border-[#152348] bg-gradient-to-b from-cyan-200 to-cyan-400 px-4 py-2 text-xs font-black text-[#111936] shadow-[0_3px_0_#2189a5] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0.5 active:shadow-none disabled:opacity-60">{claiming === quest.id ? <Loader2 className="size-4 animate-spin" /> : 'CLAIM TROPHIES'}</button>}</div>}
      </article>
    })}</div>}
  </section>
}

function PanelMessage({ label }: { label: string }) { return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-zinc-500">{label}</div> }
