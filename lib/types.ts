export interface StartGameResponse {
  runId: string
  runToken: string
  seed: string | number
  expiresAt: string
}

export interface GameInputEvidence {
  type: string
  at: number
  x?: number
  y?: number
  key?: string
}

export interface EndGameResponse {
  accepted: boolean
  verification: 'pending' | 'verified' | 'plausibility_checked'
  awarded: boolean
  score?: number
  trophiesEarned: number
  totalTrophies?: number
  runId?: string
  code?: string
  state?: { me: MeResponse; quests: Quest[] }
}

export interface Quest {
  id: string
  title: string
  description?: string
  period?: 'daily' | 'weekly' | string
  progress: number
  target: number
  reward: number
  completed: boolean
  claimed: boolean
}

export interface MeResponse {
  user?: { id?: string; displayName?: string; avatarUrl?: string }
  trophies: number
  personalBest?: number
  referralCode?: string
  rewardEmail?: string | null
  rewardEmailVerified?: boolean
  giftChoice?: string | null
  streak?: number
}

export interface EligibilityResponse {
  eligible: boolean
  rank: number | null
  cycle?: string
  rewardEmail?: string | null
  giftChoice?: string | null
  redeemed?: boolean
  deliveryStatus?: 'reserved' | 'accepted' | 'sent' | 'rejected' | 'provider_unknown' | null
}

export interface LeaderboardEntry {
  rank: number
  name: string
  trophies: number
  isCurrent?: boolean
}

export interface LeaderboardResponse {
  active?: LeaderboardEntry[]
  closed?: LeaderboardEntry[]
  currentPlayer?: LeaderboardEntry | null
  cycle?: string
}

export interface ClaimQuestResponse {
  success: boolean
  trophiesAwarded: number
  totalTrophies: number
  quest: Quest
}

export interface ReferralLinkResponse {
  referralUrl: string
  referralCode?: string
}

export interface BootstrapResponse {
  success: boolean
  csrfToken: string
  me: MeResponse
  quests: Quest[]
  leaderboard: LeaderboardResponse
  eligibility: EligibilityResponse
  referral: ReferralLinkResponse
  rewardStock?: Record<string, number>
}

export interface EndGamePayload {
  runId: string
  runToken: string
  clientScore: number
  durationMs: number
  inputs: GameInputEvidence[]
  clientSignals?: {
    suspicionScore: number
    flags: string[]
    inputCount: number
    focusChanges: number
  }
}

export interface ApiErrorShape {
  error?: string
  code?: string
  message?: string
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}
