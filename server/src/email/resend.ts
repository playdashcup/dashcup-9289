export type ResendOutcome =
  | { state: 'accepted'; messageId: string }
  | { state: 'rejected'; reason: string }
  | { state: 'provider_unknown'; reason: 'network_or_provider_ambiguity' | 'provider_unavailable' }

export async function sendRewardEmail(input: { apiKey: string; from: string; to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<ResendOutcome> {
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
    })
  } catch {
    return { state: 'provider_unknown', reason: 'network_or_provider_ambiguity' }
  }
  if (response.ok) {
    const payload = await response.json().catch(() => null) as { id?: unknown } | null
    return typeof payload?.id === 'string' ? { state: 'accepted', messageId: payload.id } : { state: 'provider_unknown', reason: 'network_or_provider_ambiguity' }
  }
  if (response.status >= 500 || response.status === 409) return { state: 'provider_unknown', reason: 'provider_unavailable' }
  return { state: 'rejected', reason: `resend_http_${response.status}` }
}
