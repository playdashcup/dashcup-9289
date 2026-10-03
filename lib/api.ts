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
let bootstrapInFlight: Promise<BootstrapResponse> | null = null

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_ORIGIN}${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
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
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'name' in cause && cause.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Check your connection and try again.', 408, 'REQUEST_TIMEOUT')
    }
    throw cause
  } finally {
    clearTimeout(timeout)
  }
}

export const api = {
  bootstrap: (referralCode?: string) => {
    if (bootstrapInFlight) return bootstrapInFlight
    const query = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''
    const pending = request<BootstrapResponse>(`/api/bootstrap${query}`).then((data) => {
      csrfToken = data.csrfToken
      return data
    })
    bootstrapInFlight = pending
    void pending.finally(() => {
      if (bootstrapInFlight === pending) bootstrapInFlight = null
    }).catch(() => undefined)
    return pending
  },
  getMe: () => request<MeResponse>('/api/me'),
  startGame: () => request<StartGameResponse>('/api/game/start', { method: 'POST', body: JSON.stringify({}) }, 12_000),
  endGame: (payload: EndGamePayload) => request<EndGameResponse>('/api/game/end', { method: 'POST', body: JSON.stringify(payload) }),
  getQuests: () => request<Quest[]>('/api/quests'),
  claimQuest: (questId: string) => request<ClaimQuestResponse>(`/api/quests/${encodeURIComponent(questId)}/claim`, { method: 'POST', body: JSON.stringify({}) }),
  startSponsorOffer: (offerId: string) => request<{ success: boolean; url: string }>('/api/sponsor/offers/start', { method: 'POST', body: JSON.stringify({ offerId }) }),
  getLeaderboard: () => request<LeaderboardResponse>('/api/leaderboard'),
  getEligibility: () => request<EligibilityResponse>('/api/rewards/eligibility'),
  redeemReward: (giftChoice: string) => request<{ success: boolean; status: string }>('/api/rewards/redeem', { method: 'POST', body: JSON.stringify({ giftChoice }) }),
  getRewardStatus: () => request<{ status: string; redemptionId: string | null; updatedAt: string | null }>('/api/rewards/status'),
  updateRewardEmail: (email: string, giftChoice: string) => request<{ success: boolean; rewardEmail: string; giftChoice: string; emailVerified: boolean; verificationStatus: string }>('/api/rewards/email', { method: 'POST', body: JSON.stringify({ email, giftChoice }) }),
  verifyRewardEmail: (token: string) => request<{ success: boolean; emailVerified: boolean }>('/api/rewards/email/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  getReferralLink: () => request<ReferralLinkResponse>('/api/referral/link'),
  startMylead: () => request<{ success: boolean }>('/api/mylead/start', { method: 'POST', body: JSON.stringify({}) }),
  reportAntiCheat: (data: Record<string, unknown>) => request<{ success: boolean }>('/api/anti-cheat/report', { method: 'POST', body: JSON.stringify(data) }),
}
