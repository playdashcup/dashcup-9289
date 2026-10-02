export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>
}

export function rateLimitKey(address: string, pathname: string) {
  return `${address}:${pathname}`
}

export async function isRateLimited(binding: RateLimitBinding | undefined, key: string) {
  if (!binding) return false
  const result = await binding.limit({ key })
  return !result.success
}
