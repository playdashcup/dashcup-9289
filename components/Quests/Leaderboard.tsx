'use client'
import type { LeaderboardResponse } from '@/lib/types'
import { getLeaderboardRowPresentation, getOutsideTop100Player } from '@/lib/leaderboard'
import { Crown, RefreshCw, Trophy } from 'lucide-react'

export function Leaderboard({ data, onRetry }: { data: LeaderboardResponse | null; onRetry: () => Promise<void> }) {
  if (!data) return <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-12 text-center"><p className="text-zinc-400">Unable to load leaderboard.</p><button onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-bold text-zinc-950"><RefreshCw className="size-4" /> Try again</button></div>
  return <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><RankList title="Active bi-weekly cycle" entries={data.active ?? []} currentPlayer={data.currentPlayer} cycle={data.cycle} active /><RankList title="Closed bi-weekly cycle" entries={data.closed ?? []} /></div>
}

function RankList({ title, entries, currentPlayer, cycle, active = false }: { title: string; entries: NonNullable<LeaderboardResponse['active']>; currentPlayer?: LeaderboardResponse['currentPlayer']; cycle?: string; active?: boolean }) {
  const outsideTop100Player = active ? getOutsideTop100Player(currentPlayer) : null
  return <section className="flex min-h-0 flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><p className="font-mono text-xs uppercase tracking-[.18em] text-cyan-300">Rankings</p><h2 className="mt-1 text-xl font-black text-white">{title}</h2>{cycle && <p className="mt-1 text-xs text-zinc-500">{cycle}</p>}</div></div>
    {entries.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">No rankings available.</p> : <div className={`${active ? 'max-h-[min(65vh,44rem)] overflow-y-auto overscroll-contain pr-1' : ''} flex flex-col gap-2`} aria-label={active ? 'Top 100 leaderboard' : undefined}>
      {entries.map((entry) => { const presentation = getLeaderboardRowPresentation(entry, active); return <div key={entry.rank} aria-current={presentation.highlightAsCurrent ? 'true' : undefined} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${presentation.highlightAsCurrent ? 'border-cyan-200/30 bg-cyan-300/[0.08] shadow-[inset_2px_0_0_#67e8f9]' : entry.rank <= 3 ? 'border-transparent bg-yellow-300/[0.06]' : 'border-transparent bg-white/[0.025]'}`}>
        <span className="grid w-7 shrink-0 place-items-center font-mono text-sm font-bold text-zinc-500" title={presentation.showTop20Crown ? 'Top 20' : `Rank ${entry.rank}`}>{presentation.showTop20Crown ? <Crown className="size-4 text-yellow-200" aria-label="Top 20" role="img" /> : `#${entry.rank}`}</span>
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-black text-zinc-300">{entry.name.slice(0, 1)}</div>
        <span className={`flex-1 truncate text-sm font-bold ${presentation.highlightAsCurrent ? 'text-cyan-50' : 'text-zinc-200'}`}>{entry.name}</span>
        {presentation.highlightAsCurrent && <span className="rounded-full bg-cyan-200/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-cyan-100">You</span>}
        <span className="flex shrink-0 items-center gap-1 font-mono text-xs font-bold text-yellow-200"><Trophy className="size-3" aria-hidden="true" />{entry.trophies.toLocaleString()}</span>
      </div>})}
    </div>}
    {outsideTop100Player && <div className="sticky bottom-0 mt-3 flex items-center gap-3 rounded-xl border border-cyan-200/30 bg-[#1b2148] px-3 py-3 shadow-[0_-8px_18px_rgba(9,13,34,.35)]" aria-label="Your current rank, outside the Top 100"><span className="w-10 shrink-0 text-center font-mono text-sm font-black text-cyan-100">{outsideTop100Player.rankLabel}</span><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan-200/15 text-xs font-black text-cyan-50">{outsideTop100Player.name.slice(0, 1)}</div><span className="flex-1 truncate text-sm font-bold text-cyan-50">{outsideTop100Player.name}<span className="ml-2 text-[10px] font-black uppercase tracking-wide text-cyan-200/70">You</span></span><span className="flex shrink-0 items-center gap-1 font-mono text-xs font-bold text-yellow-200"><Trophy className="size-3" aria-hidden="true" />{outsideTop100Player.trophies.toLocaleString()}</span></div>}
  </section>
}
