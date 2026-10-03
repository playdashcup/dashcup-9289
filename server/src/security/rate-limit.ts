export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>
}

export function rateLimitKey(address: string) {
  // Share the per-IP budget across API routes so callers cannot evade limits
  // by varying quest IDs, endpoint paths, or game actions.
  return address
}

export function isExpensiveMutation(method: string, path: string) {
  if (method !== 'POST') return false
  return path === '/api/game/start'
    || path === '/api/game/end'
    || /^\/api\/quests\/[^/]+\/claim$/.test(path)
    || path === '/api/rewards/redeem'
    || path === '/api/rewards/email'
    || path === '/api/rewards/email/verify'
    || path.startsWith('/api/admin/')
    || path === '/api/mylead/start'
    || path === '/api/sponsor/offers/start'
    || path === '/webhooks/cpalead'
    || path === '/webhooks/resend'
}

export async function isRateLimited(binding: RateLimitBinding | undefined, key: string) {
  if (!binding) return false
  const result = await binding.limit({ key })
  return !result.success
}
