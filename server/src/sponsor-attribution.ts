import type { SponsorDevice, SponsorEventType } from './sponsor-offers'

const MAX_ATTRIBUTION_AGE_SECONDS = 30 * 24 * 60 * 60
const ATTRIBUTION_AAD = new TextEncoder().encode('dashcup:cpalead:attribution:v1')
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CAMPAIGN_ID = /^\d{1,16}$/
const COUNTRY = /^[A-Z]{2}$/
const DEVICES = new Set<SponsorDevice>(['ios', 'android', 'desktop', 'mobile'])
const EVENTS = new Set<SponsorEventType>(['cpa', 'cpi', 'ppi'])

export interface SponsorAttribution {
  userId: string
  country: string
  device: SponsorDevice
  campaigns: Record<string, SponsorEventType>
}

function keyBytes(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16))
}

function toBase64Url(value: Uint8Array) {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function importAttributionKeys(value: string) {
  const raw = keyBytes(value)
  if (!raw) return null
  const encryptionMaterial = await crypto.subtle.digest('SHA-256', new Uint8Array([...new TextEncoder().encode('dashcup/cpalead/encryption/v1:'), ...raw]))
  const signingMaterial = await crypto.subtle.digest('SHA-256', new Uint8Array([...new TextEncoder().encode('dashcup/cpalead/signing/v1:'), ...raw]))
  const [encryption, signing] = await Promise.all([
    crypto.subtle.importKey('raw', encryptionMaterial, 'AES-GCM', false, ['encrypt', 'decrypt']),
    crypto.subtle.importKey('raw', signingMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
  ])
  return { encryption, signing }
}

function isValidPayload(value: unknown): value is { v: 1; u: string; c: string; d: SponsorDevice; m: [string, SponsorEventType][]; e: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return data.v === 1 && typeof data.u === 'string' && USER_ID.test(data.u)
    && typeof data.c === 'string' && COUNTRY.test(data.c)
    && typeof data.d === 'string' && DEVICES.has(data.d as SponsorDevice)
    && Array.isArray(data.m) && data.m.length > 0 && data.m.length <= 13
    && data.m.every((entry) => Array.isArray(entry) && entry.length === 2
      && typeof entry[0] === 'string' && CAMPAIGN_ID.test(entry[0])
      && typeof entry[1] === 'string' && EVENTS.has(entry[1] as SponsorEventType))
    && Number.isInteger(data.e)
}

/** An HMAC-signed, AES-GCM-encrypted subid that hides account and campaign claims. */
export async function createSponsorAttributionToken(
  attribution: SponsorAttribution,
  secret: string,
  nowMs = Date.now(),
): Promise<string | null> {
  const keys = await importAttributionKeys(secret)
  const campaigns = Object.entries(attribution.campaigns)
  if (!keys || !USER_ID.test(attribution.userId) || !COUNTRY.test(attribution.country) || !DEVICES.has(attribution.device)
    || campaigns.length === 0 || campaigns.length > 13
    || campaigns.some(([id, eventType]) => !CAMPAIGN_ID.test(id) || !EVENTS.has(eventType))) return null

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const expiresAt = Math.floor(nowMs / 1_000) + MAX_ATTRIBUTION_AGE_SECONDS
  const plaintext = new TextEncoder().encode(JSON.stringify({
    v: 1,
    u: attribution.userId,
    c: attribution.country,
    d: attribution.device,
    m: campaigns,
    e: expiresAt,
  }))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ATTRIBUTION_AAD, tagLength: 128 }, keys.encryption, plaintext))
  const tokenBytes = new Uint8Array(iv.length + encrypted.length)
  tokenBytes.set(iv)
  tokenBytes.set(encrypted, iv.length)
  const body = `v1.${toBase64Url(tokenBytes)}`
  const signature = await crypto.subtle.sign('HMAC', keys.signing, new TextEncoder().encode(body))
  return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

export async function verifySponsorAttributionToken(
  value: string,
  secret: string,
  nowMs = Date.now(),
): Promise<SponsorAttribution | null> {
  if (value.length > 512 || !value.startsWith('v1.')) return null
  const parts = value.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const keys = await importAttributionKeys(secret)
  const tokenBytes = fromBase64Url(parts[1])
  const signature = fromBase64Url(parts[2])
  const body = `${parts[0]}.${parts[1]}`
  if (!keys || !tokenBytes || tokenBytes.length < 29 || !signature || signature.length !== 32) return null
  try {
    if (!await crypto.subtle.verify('HMAC', keys.signing, signature, new TextEncoder().encode(body))) return null
    const iv = tokenBytes.slice(0, 12)
    const ciphertext = tokenBytes.slice(12)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: ATTRIBUTION_AAD, tagLength: 128 }, keys.encryption, ciphertext)
    const payload: unknown = JSON.parse(new TextDecoder().decode(plaintext))
    if (!isValidPayload(payload)) return null
    const now = Math.floor(nowMs / 1_000)
    if (payload.e <= now || payload.e > now + MAX_ATTRIBUTION_AGE_SECONDS + 60) return null
    return { userId: payload.u, country: payload.c, device: payload.d, campaigns: Object.fromEntries(payload.m) }
  } catch {
    return null
  }
}
