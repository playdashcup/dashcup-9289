export type SponsorDevice = 'ios' | 'android' | 'desktop' | 'mobile'
export type SponsorEventType = 'cpa' | 'cpi' | 'ppi'

export interface CpaleadOffer {
  id: number | string
  title?: unknown
  description?: unknown
  conversion?: unknown
  device?: unknown
  link?: unknown
  payout_type?: unknown
  countries?: unknown
  offer_rank?: unknown
}

export interface SponsorOffer {
  id: string
  title: string
  description: string
  action: string
  type: 'CPA' | 'CPI' | 'PPI'
  rank: number
}

/** Campaigns supplied by the publisher. Eligibility is intentionally the user's narrower targeting. */
export const SPONSOR_CAMPAIGNS: Record<string, { countries: readonly string[]; devices: readonly SponsorDevice[] }> = {
  '5546840': { countries: ['US'], devices: ['ios'] },
  '5547025': { countries: ['US'], devices: ['ios'] },
  '5546990': { countries: ['US'], devices: ['ios'] },
  '5546960': { countries: ['BR', 'EG', 'GH', 'ID', 'IN', 'NG', 'TH', 'TR', 'US', 'VN'], devices: ['desktop'] },
  '5547012': { countries: ['AU', 'CA', 'GB', 'NZ', 'US'], devices: ['ios', 'android', 'desktop', 'mobile'] },
  '5547007': { countries: ['GB'], devices: ['android'] },
  '5543785': { countries: ['DE'], devices: ['desktop'] },
  '5547038': { countries: ['AT', 'AU', 'BE', 'CA', 'CH', 'DE', 'DK', 'ES', 'FI', 'FR', 'GB', 'HU', 'IE', 'IT', 'NL', 'NO', 'NZ', 'PL', 'PT', 'SE', 'SG', 'US'], devices: ['android'] },
  '5546445': { countries: ['GB'], devices: ['ios'] },
  '5545707': { countries: ['FR'], devices: ['desktop'] },
  '5545706': { countries: ['ES'], devices: ['desktop'] },
  '5546903': { countries: ['KW', 'OM', 'QA', 'SA'], devices: ['android'] },
  '5547029': { countries: ['BD'], devices: ['mobile'] },
}

const allowedTypes: Record<string, SponsorOffer['type']> = { CPA: 'CPA', CPI: 'CPI', PPI: 'PPI' }

export function detectSponsorDevice(userAgent: string, clientHint?: string): SponsorDevice {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (clientHint === '?1' || /Mobile|Windows Phone/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

export function filterSponsorOffers(offers: CpaleadOffer[], country: string, device: SponsorDevice): SponsorOffer[] {
  const normalizedCountry = country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalizedCountry)) return []
  return offers.flatMap((offer) => {
    const id = String(offer.id)
    const rule = SPONSOR_CAMPAIGNS[id]
    const type = typeof offer.payout_type === 'string' ? allowedTypes[offer.payout_type.toUpperCase()] : undefined
    const deviceAllowed = rule?.devices.includes(device) || Boolean(rule?.devices.includes('mobile') && (device === 'ios' || device === 'android'))
    if (!rule || !type || !rule.countries.includes(normalizedCountry) || !deviceAllowed) return []
    const apiCountries = Array.isArray(offer.countries) ? offer.countries.map((value) => String(value).toUpperCase()) : []
    if (!apiCountries.includes(normalizedCountry)) return []
    const rawDevice = typeof offer.device === 'string' ? offer.device.toLowerCase() : ''
    if (rawDevice === 'ios' && device !== 'ios' || rawDevice === 'android' && device !== 'android' || rawDevice === 'desktop' && device !== 'desktop') return []
    const title = safeText(offer.title, 120)
    const description = safeText(offer.description, 240)
    const action = safeText(offer.conversion, 400)
    if (!title || !action) return []
    return [{ id, title, description, action, type, rank: Number.isInteger(offer.offer_rank) ? Number(offer.offer_rank) : Number.MAX_SAFE_INTEGER }]
  }).sort((a, b) => a.rank - b.rank)
}

export function isAllowedSponsorTarget(campaignId: string, country: string): boolean {
  const rule = SPONSOR_CAMPAIGNS[campaignId]
  return Boolean(rule && rule.countries.includes(country.toUpperCase()))
}

export function appendSponsorSubid(trackingUrl: string, publisherId: string, offerId: string, subid: string): string | null {
  try {
    const url = new URL(trackingUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.searchParams.get('id') !== offerId || url.searchParams.get('pub') !== publisherId) return null
    url.searchParams.set('subid', subid)
    return url.toString()
  } catch {
    return null
  }
}

export function isValidSponsorPostbackId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength) : ''
}
