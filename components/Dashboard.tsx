'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { api } from '@/lib/api'
import type { ClaimQuestResponse, EndGameResponse, EligibilityResponse, LeaderboardResponse, MeResponse, Quest, ReferralLinkResponse } from '@/lib/types'
import { GameBridge } from '@/components/Game/GameBridge'
import { QuestBoard } from '@/components/Quests/QuestBoard'
import { Leaderboard } from '@/components/Quests/Leaderboard'
import { RewardPanel } from '@/components/Rewards/RewardPanel'
import { ReferralPanel } from '@/components/Referrals/ReferralPanel'
import { ServiceWorker } from '@/components/ServiceWorker'
import { AntiCheatTelemetry } from '@/components/Security/AntiCheatTelemetry'
import { HilltopBanner, HilltopVast } from '@/components/ads/HilltopBanner'
import { Trophy, Gamepad2, Target, Crown, Gift, Zap } from 'lucide-react'

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
  const [referral, setReferral] = useState<ReferralLinkResponse | null>(null)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const referralCode = new URLSearchParams(window.location.search).get('ref') ?? undefined
      const bootstrap = await api.bootstrap(referralCode)
      window.history.replaceState({}, '', window.location.pathname)
      setMe(bootstrap.me)
      setQuests(bootstrap.quests)
      setLeaderboard(bootstrap.leaderboard)
      setEligibility(bootstrap.eligibility)
      setReferral(bootstrap.referral)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect to DASHCUP')
    } finally { setBooting(false) }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [loadData])

  const onGameComplete = useCallback((result: EndGameResponse) => {
    const state = result.state
    if (!state) return
    setMe(state.me)
    setQuests(state.quests)
  }, [])

  const onQuestClaimed = useCallback((result: ClaimQuestResponse) => {
    setMe((current) => current ? { ...current, trophies: result.totalTrophies } : current)
    setQuests((current) => current?.map((quest) => quest.id === result.quest.id ? result.quest : quest) ?? current)
  }, [])

  const onRewardDetailsSaved = useCallback((rewardEmail: string, giftChoice: string) => {
    setMe((current) => current ? { ...current, rewardEmail, giftChoice } : current)
  }, [])

  const trophyLabel = me?.trophies == null ? '—' : me.trophies.toLocaleString()

  return (
    <div className="min-h-screen text-zinc-100 selection:bg-pink-300 selection:text-indigo-950">
      <ServiceWorker />
      <AntiCheatTelemetry />
      <header className="sticky top-0 z-20 border-b-2 border-white/10 bg-[#11142f]/85 shadow-[0_5px_0_rgba(8,12,35,.45)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6 sm:py-3 lg:px-8">
          <button onClick={() => setActive('arcade')} className="flex items-center gap-3" aria-label="Go to DASHCUP arcade">
            <Image src="/dashcup-logo/dashcup-symbol.png" alt="" width={44} height={44} priority className="size-10 object-contain drop-shadow-[0_0_12px_rgba(0,190,235,.25)]" />
            <span className="font-mono text-lg font-black tracking-[.12em] text-white">DASHCUP</span>
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 rounded-full border-2 border-[#8c6935] bg-gradient-to-b from-[#ffe687] to-[#ffc84f] px-2.5 py-1.5 font-mono text-xs font-black text-[#412c36] shadow-[0_4px_0_#754931] sm:gap-2 sm:px-3 sm:py-2 sm:text-sm">
              <Trophy className="size-4" aria-hidden="true" /> {trophyLabel}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-pink-200/20 bg-pink-300/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[.2em] text-pink-200 sm:text-xs">DASHCUP / MEMBER HUB</p>
            <h1 className="max-w-[19rem] text-3xl font-black leading-[1.05] tracking-tight text-white [text-shadow:0_3px_0_#34386a] sm:max-w-none sm:text-5xl">Play sharp.<br className="sm:hidden" /> Stack trophies.</h1>
            <p className="mt-3 max-w-xl text-sm font-medium text-indigo-100/75">Take a quick arcade run, hit your daily quests, and climb the ranks.</p>
          </div>
          <div className="hidden items-center gap-2 rounded-2xl border-2 border-[#4c4678] bg-gradient-to-br from-[#282d5b] to-[#1d2248] px-4 py-3 shadow-[0_5px_0_#111631] md:flex">
            <Zap className="size-4 text-[#b9ff70]" aria-hidden="true" />
            <span className="text-xs font-bold text-indigo-100/70">Personal best</span>
            <strong className="font-mono text-sm text-[#c7ff8d]">{me?.personalBest?.toLocaleString() ?? '—'}</strong>
          </div>
        </div>

        <nav className="mb-7 hidden gap-1 rounded-2xl border-2 border-[#32385f] bg-[#171b3d]/85 p-1.5 shadow-[0_5px_0_#0b1027] md:flex" aria-label="Main navigation">
          {sections.map(({ id, label, icon: Icon }) => <NavButton key={id} active={active === id} onClick={() => setActive(id)} label={label} Icon={Icon} />)}
        </nav>

        {error && <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"><span>{error}</span><button onClick={() => { setBooting(true); void loadData() }} className="font-bold underline">Try again</button></div>}
        {booting ? <div className="grid min-h-[440px] place-items-center rounded-3xl border border-white/10 bg-white/[0.025]"><div className="text-center"><div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" /><p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Syncing DASHCUP</p></div></div> : <>
          {active === 'arcade' && <>
            <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[1.35fr_.65fr]"><GameBridge onComplete={onGameComplete} /><ReferralPanel referralUrl={referral?.referralUrl ?? null} onViewQuests={() => setActive('quests')} /></div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <HilltopBanner />
              <HilltopVast />
            </div>
          </>}
          {active === 'quests' && <QuestBoard quests={quests} onClaimed={onQuestClaimed} />}
          {active === 'leaderboard' && <Leaderboard data={leaderboard} onRetry={async () => setLeaderboard(await api.getLeaderboard())} />}
          {active === 'rewards' && <RewardPanel eligibility={eligibility} me={me} onDetailsSaved={onRewardDetailsSaved} />}
        </>}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-[#43466d] bg-[#11142f]/95 px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-5px_0_rgba(7,10,28,.4)] backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">{sections.map(({ id, label, icon: Icon }) => <NavButton key={id} active={active === id} onClick={() => setActive(id)} label={label} Icon={Icon} mobile />)}</div>
      </nav>
    </div>
  )
}

function NavButton({ active, onClick, label, Icon, mobile }: { active: boolean; onClick: () => void; label: string; Icon: typeof Gamepad2; mobile?: boolean }) {
  return <button onClick={onClick} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${mobile ? 'min-h-12 flex-col gap-1 py-2 text-[10px]' : ''} ${active ? 'border-2 border-[#172047] bg-gradient-to-b from-[#8af4ff] to-[#5ad8ef] text-[#15203e] shadow-[0_4px_0_#328aa2]' : 'text-indigo-100/65 hover:bg-white/10 hover:text-white'}`} aria-current={active ? 'page' : undefined}><Icon className={mobile ? 'size-4' : 'size-4'} aria-hidden="true" />{label}</button>
}
