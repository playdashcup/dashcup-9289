'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { EligibilityResponse, LeaderboardResponse, MeResponse, Quest } from '@/lib/types'
import { GameBridge } from '@/components/Game/GameBridge'
import { QuestBoard } from '@/components/Quests/QuestBoard'
import { Leaderboard } from '@/components/Quests/Leaderboard'
import { RewardPanel } from '@/components/Rewards/RewardPanel'
import { ReferralPanel } from '@/components/Referrals/ReferralPanel'
import { ServiceWorker } from '@/components/ServiceWorker'
import { AntiCheatTelemetry } from '@/components/Security/AntiCheatTelemetry'
import { Trophy, Gamepad2, Target, Crown, Gift, UserRound, Copy, ArrowUpRight, Zap } from 'lucide-react'

const sections = [
  { id: 'arcade', label: 'Arcade', icon: Gamepad2 },
  { id: 'quests', label: 'Quests', icon: Target },
  { id: 'leaderboard', label: 'Ranks', icon: Crown },
  { id: 'rewards', label: 'Rewards', icon: Gift },
] as const

type Section = (typeof sections)[number]['id']

export function Dashboard() {
  const [active, setActive] = useState<Section>('arcade')
  const [me, setMe] = useState<MeResponse | null>(null)
  const [quests, setQuests] = useState<Quest[] | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null)
  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshMe = useCallback(async () => setMe(await api.getMe()), [])
  const refreshQuests = useCallback(async () => setQuests(await api.getQuests()), [])
  const loadData = useCallback(async () => {
    try {
      setError(null)
      const referralCode = new URLSearchParams(window.location.search).get('ref') ?? undefined
      await api.bootstrap(referralCode)
      window.history.replaceState({}, '', window.location.pathname)
      const [profile, questData, ranks, reward] = await Promise.all([api.getMe(), api.getQuests(), api.getLeaderboard(), api.getEligibility()])
      setMe(profile); setQuests(questData); setLeaderboard(ranks); setEligibility(reward)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect to DASHCUP')
    } finally { setBooting(false) }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  const trophyLabel = useMemo(() => me?.trophies == null ? '—' : me.trophies.toLocaleString(), [me?.trophies])

  return (
    <div className="min-h-screen bg-[#080a0f] text-zinc-100 selection:bg-cyan-300 selection:text-zinc-950">
      <ServiceWorker />
      <AntiCheatTelemetry />
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#080a0f]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <button onClick={() => setActive('arcade')} className="flex items-center gap-3" aria-label="Go to DASHCUP arcade">
            <span className="grid size-9 place-items-center rounded-xl bg-cyan-300 text-lg font-black text-zinc-950 shadow-[0_0_24px_rgba(103,232,249,.25)]">D</span>
            <span className="font-mono text-lg font-bold tracking-[.14em] text-white">DASHCUP</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 font-mono text-sm font-bold text-yellow-200">
              <Trophy className="size-4" aria-hidden="true" /> {trophyLabel}
            </div>
            <button className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-zinc-300 transition hover:border-cyan-300/50 hover:text-cyan-200" aria-label="Open profile">
              <UserRound className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-7 sm:px-6 lg:px-8 lg:pb-10">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 font-mono text-xs font-bold uppercase tracking-[.2em] text-cyan-300">DASHCUP / MEMBER HUB</p>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Play sharp. Stack trophies.</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">A fast lane for verified runs, daily quests, and rewards worth chasing.</p>
          </div>
          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 md:flex">
            <Zap className="size-4 text-cyan-300" aria-hidden="true" />
            <span className="text-xs text-zinc-400">Personal best</span>
            <strong className="font-mono text-sm text-white">{me?.personalBest?.toLocaleString() ?? '—'}</strong>
          </div>
        </div>

        <nav className="mb-7 hidden gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 md:flex" aria-label="Main navigation">
          {sections.map(({ id, label, icon: Icon }) => <NavButton key={id} active={active === id} onClick={() => setActive(id)} label={label} Icon={Icon} />)}
        </nav>

        {error && <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"><span>{error}</span><button onClick={() => { setBooting(true); void loadData() }} className="font-bold underline">Try again</button></div>}
        {booting ? <div className="grid min-h-[440px] place-items-center rounded-3xl border border-white/10 bg-white/[0.025]"><div className="text-center"><div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" /><p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Syncing DASHCUP</p></div></div> : <>
          {active === 'arcade' && <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]"><GameBridge onComplete={() => { void refreshMe(); void refreshQuests() }} /><ReferralPanel /></div>}
          {active === 'quests' && <QuestBoard quests={quests} onRefresh={refreshQuests} onTrophiesChanged={refreshMe} />}
          {active === 'leaderboard' && <Leaderboard data={leaderboard} onRetry={async () => setLeaderboard(await api.getLeaderboard())} />}
          {active === 'rewards' && <RewardPanel eligibility={eligibility} me={me} onRefresh={async () => { await refreshMe(); setEligibility(await api.getEligibility()) }} />}
        </>}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0b0d13]/95 px-2 py-2 backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">{sections.map(({ id, label, icon: Icon }) => <NavButton key={id} active={active === id} onClick={() => setActive(id)} label={label} Icon={Icon} mobile />)}</div>
      </nav>
    </div>
  )
}

function NavButton({ active, onClick, label, Icon, mobile }: { active: boolean; onClick: () => void; label: string; Icon: typeof Gamepad2; mobile?: boolean }) {
  return <button onClick={onClick} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${mobile ? 'flex-col gap-1 py-2 text-[10px]' : ''} ${active ? 'bg-cyan-300 text-zinc-950 shadow-[0_0_18px_rgba(103,232,249,.18)]' : 'text-zinc-500 hover:bg-white/5 hover:text-white'}`} aria-current={active ? 'page' : undefined}><Icon className={mobile ? 'size-4' : 'size-4'} aria-hidden="true" />{label}</button>
}
