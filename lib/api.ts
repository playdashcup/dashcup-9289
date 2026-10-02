import type {
  BootstrapResponse,
  ClaimQuestResponse,
  EligibilityResponse,
  EndGamePayload,
  EndGameResponse,
  LeaderboardResponse,
  MeResponse,
  Quest,
  ReferralLinkResponse,
  StartGameResponse,
} from '@/lib/types'
import { ApiError } from '@/lib/types'

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : 'https://api.dashcup.com')
let csrfToken: string | null = null

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.method && init.method !== 'GET' && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...init.headers,
    },
  })
  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `Request failed (${response.status})`
    throw new ApiError(message, response.status, body?.code)
  }
  return body as T
}

export const api = {
  bootstrap: async (referralCode?: string) => {
    const query = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''
    const data = await request<BootstrapResponse>(`/api/bootstrap${query}`)
    csrfToken = data.csrfToken
    return data
  },
  getMe: () => request<MeResponse>('/api/me'),
  startGame: () => request<StartGameResponse>('/api/game/start', { method: 'POST', body: JSON.stringify({}) }),
  endGame: (payload: EndGamePayload) => request<EndGameResponse>('/api/game/end', { method: 'POST', body: JSON.stringify(payload) }),
  getQuests: () => request<Quest[]>('/api/quests'),
  claimQuest: (questId: string) => request<ClaimQuestResponse>(`/api/quests/${encodeURIComponent(questId)}/claim`, { method: 'POST', body: JSON.stringify({}) }),
  getLeaderboard: () => request<LeaderboardResponse>('/api/leaderboard'),
  getEligibility: () => request<EligibilityResponse>('/api/rewards/eligibility'),
  redeemReward: (giftChoice: string) => request<{ success: boolean; status: string }>('/api/rewards/redeem', { method: 'POST', body: JSON.stringify({ giftChoice }) }),
  getRewardStatus: () => request<{ status: string; redemptionId: string | null; updatedAt: string | null }>('/api/rewards/status'),
  updateRewardEmail: (email: string, giftChoice: string) => request<{ success: boolean }>('/api/rewards/email', { method: 'POST', body: JSON.stringify({ email, giftChoice }) }),
  getReferralLink: () => request<ReferralLinkResponse>('/api/referral/link'),
  startMylead: () => request<{ success: boolean }>('/api/mylead/start', { method: 'POST', body: JSON.stringify({}) }),
  reportAntiCheat: (data: Record<string, unknown>) => request<{ success: boolean }>('/api/anti-cheat/report', { method: 'POST', body: JSON.stringify(data) }),
}
