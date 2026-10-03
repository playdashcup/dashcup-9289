import type { LeaderboardEntry } from './types'

export function getLeaderboardRowPresentation(entry: LeaderboardEntry, activeCycle: boolean) {
  return {
    showTop20Crown: entry.rank >= 1 && entry.rank <= 20,
    highlightAsCurrent: activeCycle && entry.isCurrent === true && entry.rank >= 1 && entry.rank <= 100,
  }
}

export function getOutsideTop100Player(currentPlayer: LeaderboardEntry | null | undefined) {
  return currentPlayer && currentPlayer.rank > 100
    ? { ...currentPlayer, rankLabel: '>100' as const }
    : null
}
