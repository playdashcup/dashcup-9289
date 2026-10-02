export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>
}

export function rateLimitKey(address: string) {
  // Share the per-IP budget across API routes so callers cannot evade limits
  // by varying quest IDs, endpoint paths, or game actions.
  return address
}

export async function isRateLimited(binding: RateLimitBinding | undefined, key: string) {
  if (!binding) return false
  const result = await binding.limit({ key })
  return !result.success
}
