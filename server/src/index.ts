import { neon } from '@neondatabase/serverless'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { decryptRewardCode, encryptRewardCode, type RewardType } from './security/reward-code'
import { constantTimeStringEqual } from './security/timing-safe'
import { rewardEmailTemplate, rewardEmailVerificationTemplate } from './email/reward-template'
import { sendRewardEmail } from './email/resend'
import { renderAdminPortal } from './admin/portal'
import { verifyAdminCredentials } from './security/admin-auth'
import { isExpensiveMutation, isRateLimited, rateLimitKey } from './security/rate-limit'
import { biweeklyId, dayId, MAX_INPUTS, MAX_RUN_MS, QUESTS, randomDisplayName, sanitizeClientSignals, validateEvidence, weekId } from './domain'
import { appendSponsorSubid, detectSponsorDevice, filterSponsorOffers, isAllowedSponsorTarget, isValidSponsorPostbackId, SPONSOR_CAMPAIGNS, type CpaleadOffer, type SponsorOffer } from './sponsor-offers'

interface Env {
  DATABASE_URL?: string
  ASSETS: { fetch(request: Request): Promise<Response> }
  API_RATE_LIMIT: { limit(input: { key: string }): Promise<{ success: boolean }> }
  MUTATION_RATE_LIMIT?: { limit(input: { key: string }): Promise<{ success: boolean }> }
  ALLOWED_ORIGINS: string
  ENVIRONMENT: string
  PUBLIC_ORIGIN: string
  REWARD_ENCRYPTION_KEY?: string
  REWARD_ADMIN_USERNAME?: string
  REWARD_ADMIN_PASSWORD_HASH?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  REWARD_EMAIL_DELIVERY_ENABLED?: string
  GAME_REPLAY_ENABLED?: string
  RESEND_WEBHOOK_SECRET?: string
  CPALEAD_PUBLISHER_ID?: string
  CPALEAD_POSTBACK_PASSWORD?: string
}

type Variables = { userId: string; sessionId: string; csrfHash: string }
type AppContext = Context<{ Bindings: Env; Variables: Variables }>
type RewardRedemption = { id: string; status: string; delivery_status: string; idempotency_key: string; delivery_attempt: number; recipient_email: string; reward_type: RewardType; encrypted_code: Uint8Array; iv: Uint8Array; authentication_tag: Uint8Array }
const app = new Hono<{ Bindings: Env; Variables: Variables }>()
const SESSION_COOKIE = 'dashcup_session'
const ADMIN_SESSION_COOKIE = '__Secure-dashcup_admin'
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60
const ADMIN_ORIGIN = 'https://admin.dashcup.com'
const CYCLE_MS = 14 * 24 * 60 * 60 * 1_000
const RUN_CLOCK_TOLERANCE_MS = 10_000
const CPALEAD_FEED_TTL_MS = 10 * 60 * 1_000
const CPALEAD_FEED_CACHE_KEY = 'https://dashcup-cache.invalid/cpalead/publisher-offers-v1'
let cpaleadFeedMemory: { publisherId: string; offers: CpaleadOffer[]; expiresAt: number; staleUntil: number } | undefined
let cpaleadFeedRequest: Promise<CpaleadOffer[]> | undefined

async function cpaleadOffers(env: Env): Promise<CpaleadOffer[]> {
  const publisherId = env.CPALEAD_PUBLISHER_ID?.trim() ?? ''
  if (!/^\d{1,16}$/.test(publisherId)) return []
  const now = Date.now()
  if (cpaleadFeedMemory?.publisherId === publisherId && cpaleadFeedMemory.expiresAt > now) return cpaleadFeedMemory.offers
  if (cpaleadFeedRequest) return cpaleadFeedRequest

  cpaleadFeedRequest = (async () => {
    const cache = typeof caches === 'undefined' ? undefined : (caches as CacheStorage & { default?: Cache }).default
    const cacheKey = new Request(`${CPALEAD_FEED_CACHE_KEY}/${publisherId}`)
    const cached = await cache?.match(cacheKey).catch(() => undefined)
    if (cached) {
      const offers = await cached.json<CpaleadOffer[]>().catch(() => [])
      if (Array.isArray(offers)) {
        cpaleadFeedMemory = { publisherId, offers, expiresAt: Date.now() + CPALEAD_FEED_TTL_MS, staleUntil: Date.now() + 60 * 60 * 1_000 }
        return offers
      }
    }

    const url = new URL('https://www.cpalead.com/api/offers')
    url.searchParams.set('id', publisherId)
    url.searchParams.set('fields', 'id,title,description,conversion,device,link,payout_type,countries,offer_rank')
    url.searchParams.set('limit', '2500')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4_000)
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
      if (!response.ok) throw new Error('CPAlead offers unavailable')
      const body = await response.text()
      if (body.length > 2_000_000) throw new Error('CPAlead offer feed exceeded size limit')
      const payload = JSON.parse(body) as { status?: unknown; offers?: unknown }
      if (payload.status !== 'success' || !Array.isArray(payload.offers) || payload.offers.length > 2_500) throw new Error('CPAlead offers response invalid')
      const offers = payload.offers as CpaleadOffer[]
      cpaleadFeedMemory = { publisherId, offers, expiresAt: Date.now() + CPALEAD_FEED_TTL_MS, staleUntil: Date.now() + 60 * 60 * 1_000 }
      const stored = new Response(JSON.stringify(offers), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } })
      await cache?.put(cacheKey, stored).catch(() => undefined)
      return offers
    } catch {
      if (cpaleadFeedMemory?.publisherId === publisherId && cpaleadFeedMemory.staleUntil > Date.now()) return cpaleadFeedMemory.offers
      return []
    } finally {
      clearTimeout(timeout)
    }
  })().finally(() => { cpaleadFeedRequest = undefined })
  return cpaleadFeedRequest
}

async function eligibleSponsorOffers(c: AppContext): Promise<SponsorOffer[]> {
  if (!c.env.CPALEAD_PUBLISHER_ID || !c.env.CPALEAD_POSTBACK_PASSWORD) return []
  const cf = (c.req.raw as Request & { cf?: { country?: string } }).cf
  const country = cf?.country ?? ''
  const device = detectSponsorDevice(c.req.header('user-agent') ?? '', c.req.header('sec-ch-ua-mobile'))
  const offers = await cpaleadOffers(c.env)
  return filterSponsorOffers(offers, country, device)
}

function serializedQuest(row: { id: string; type: string; period: string; target: number; progress: number; reward: number; completed: boolean; claimed: boolean }, offers: SponsorOffer[] = []) {
  const definition = QUESTS.find((item) => item.type === row.type)
  return { id: row.id, type: row.type, title: definition?.title ?? row.type, description: definition?.description,
    period: row.period, target: row.target, progress: row.progress, reward: row.reward,
    completed: row.completed, claimed: row.claimed, ...(row.type === 'sponsor_app' ? { sponsorOffers: offers } : {}) }
}

function sqlFor(env: Env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_UNAVAILABLE')
  return neon(env.DATABASE_URL)
}

function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return [...data].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function cookieOptions() {
  return { httpOnly: true as const, secure: true as const, sameSite: 'Lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 }
}

function decodeBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function verifyResendSignature(secret: string, eventId: string, timestamp: string, signatureHeader: string, payload: string) {
  const seconds = Number(timestamp)
  if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1_000 - seconds) > 300) return false
  const keyBytes = decodeBase64(secret.replace(/^whsec_/, ''))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${eventId}.${timestamp}.${payload}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)))
  for (const signature of signatureHeader.split(' ')) {
    const [version, value] = signature.split(',', 2)
    if (version === 'v1' && value && await constantTimeStringEqual(expected, value)) return true
  }
  return false
}

app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin')
  const allowed = new Set((c.env.ALLOWED_ORIGINS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean))
  if (origin && !allowed.has(origin)) return c.json({ error: 'Origin is not allowed', code: 'ORIGIN_DENIED' }, 403)
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Credentials', 'true')
    c.header('Vary', 'Origin')
  }
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token,Idempotency-Key')
    c.header('Access-Control-Max-Age', '600')
    return c.body(null, 204)
  }
  const address = c.req.header('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(c.env.API_RATE_LIMIT, rateLimitKey(address))) {
    return c.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
  }
  if (isExpensiveMutation(c.req.method, c.req.path)
    && await isRateLimited(c.env.MUTATION_RATE_LIMIT, rateLimitKey(address))) {
    return c.json({ error: 'Too many mutation requests', code: 'MUTATION_RATE_LIMITED' }, 429)
  }
  await next()
})

app.use('/api/*', bodyLimit({
  maxSize: 128_000,
  onError: (c) => c.json({ error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' }, 413),
}))
app.use('/webhooks/resend', bodyLimit({
  maxSize: 64_000,
  onError: (c) => c.json({ error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' }, 413),
}))
app.use('/webhooks/resend', async (c, next) => {
  const address = c.req.header('CF-Connecting-IP') ?? 'unknown'
  if (isExpensiveMutation(c.req.method, c.req.path)
    && await isRateLimited(c.env.MUTATION_RATE_LIMIT, rateLimitKey(address))) {
    return c.json({ error: 'Too many provider callbacks', code: 'MUTATION_RATE_LIMITED' }, 429)
  }
  await next()
})

app.get('/api/health', async (c) => {
  try {
    const [row] = await sqlFor(c.env)`SELECT now() AS database_time`
    return c.json({ ok: true, environment: c.env.ENVIRONMENT, database: Boolean(row?.database_time) })
  } catch {
    return c.json({ ok: false, code: 'DATABASE_UNAVAILABLE' }, 503)
  }
})

app.get('/api/bootstrap', async (c) => {
  const sql = sqlFor(c.env)
  const now = new Date()
  let csrfToken = randomToken()
  let csrfHash = await sha256(csrfToken)
  let token = getCookie(c, SESSION_COOKIE)
  let session: { id: string; user_id: string } | null = null
  if (token) {
    const [rotated] = await sql`UPDATE sessions SET csrf_hash=${csrfHash}
      WHERE token_hash=${await sha256(token)} AND expires_at > now() AND revoked_at IS NULL
      RETURNING id,user_id`
    session = (rotated as { id: string; user_id: string } | undefined) ?? null
  }

  if (!session) {
    token = randomToken()
    csrfToken = randomToken()
    csrfHash = await sha256(csrfToken)
    const referralCode = randomToken(8)
    const [created] = await sql`
      WITH u AS (
        INSERT INTO users(display_name,referral_code) VALUES (${randomDisplayName()},${referralCode}) RETURNING id
      ), s AS (
        INSERT INTO sessions(user_id, token_hash, csrf_hash, expires_at)
        SELECT id, ${await sha256(token)}, ${csrfHash}, now() + interval '30 days' FROM u
        RETURNING id, user_id
      ) SELECT id, user_id FROM s`
    session = created as { id: string; user_id: string }
    setCookie(c, SESSION_COOKIE, token, cookieOptions())
    const referralCodeQuery = new URL(c.req.url).searchParams.get('ref')
    if (referralCodeQuery && referralCodeQuery !== referralCode && referralCodeQuery.length <= 32) {
      await sql`INSERT INTO referrals(referrer_id, referee_id, referral_code)
        SELECT id, ${session.user_id}, ${referralCodeQuery} FROM users WHERE referral_code=${referralCodeQuery} AND id <> ${session.user_id}
        ON CONFLICT(referee_id) DO NOTHING`
    }
  }
  c.set('csrfHash', csrfHash)
  c.header('X-Dashcup-CSRF-Token', csrfToken)
  const activeSession = session
  if (!activeSession) return c.json({ error: 'Unable to establish session', code: 'SESSION_FAILED' }, 503)
  c.set('userId', activeSession.user_id)
  c.set('sessionId', activeSession.id)

  const dailyId = dayId(now)
  const weeklyId = weekId(now)
  const questRows = QUESTS.map((quest) => ({
    id: `${quest.period}:${quest.period === 'daily' ? dailyId : weeklyId}:${quest.type}`,
    user_id: activeSession.user_id,
    cycle_type: quest.period,
    cycle_id: quest.period === 'daily' ? dailyId : weeklyId,
    quest_type: quest.type,
    target: quest.target,
    reward: quest.reward,
  }))
  const [snapshot] = await sql`WITH seeded_quests AS (
      INSERT INTO quests(id,user_id,cycle_type,cycle_id,quest_type,target,reward)
      SELECT id,user_id,cycle_type,cycle_id,quest_type,target,reward
      FROM jsonb_to_recordset(${JSON.stringify(questRows)}::jsonb) AS x(id text,user_id uuid,cycle_type text,cycle_id text,quest_type text,target integer,reward integer)
      ON CONFLICT(user_id,cycle_type,cycle_id,quest_type) DO UPDATE
        SET reward=EXCLUDED.reward,updated_at=now()
        WHERE quests.claimed=false AND quests.reward IS DISTINCT FROM EXCLUDED.reward
      RETURNING id,user_id,cycle_type,cycle_id,quest_type,target,progress,reward,completed,claimed
    ) SELECT u.id,u.display_name,u.trophies,u.personal_best,u.referral_code,u.reward_email,u.reward_email_verified_at,u.gift_choice,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'type',q.quest_type,'period',q.cycle_type,'target',q.target,
        'progress',q.progress,'reward',q.reward,'completed',q.completed,'claimed',q.claimed)
        ORDER BY q.cycle_type,q.quest_type)
        FROM (SELECT id,user_id,cycle_type,cycle_id,quest_type,target,progress,reward,completed,claimed FROM quests
          WHERE user_id=u.id AND quest_type<>'cpa_1' AND ((cycle_type='daily' AND cycle_id=${dailyId}) OR (cycle_type='weekly' AND cycle_id=${weeklyId}))
            AND NOT EXISTS(SELECT 1 FROM seeded_quests seeded WHERE seeded.id=quests.id)
          UNION ALL
          SELECT id,user_id,cycle_type,cycle_id,quest_type,target,progress,reward,completed,claimed FROM seeded_quests) q),'[]'::jsonb) AS quests
    ,COALESCE((SELECT jsonb_object_agg(stock.reward_type,stock.available)
      FROM (SELECT slots.reward_type,count(code.id) FILTER (WHERE code.status='available')::integer AS available
        FROM reward_inventory_slots slots LEFT JOIN reward_codes code ON code.id=slots.reward_code_id
        GROUP BY slots.reward_type) stock),'{}'::jsonb) AS reward_stock
    FROM users u WHERE u.id=${activeSession.user_id} AND u.disabled_at IS NULL`
  const user = snapshot
  if (!user) return c.json({ error: 'Session user unavailable', code: 'SESSION_INVALID' }, 401)
  const quests = snapshot.quests as Array<{ id: string; type: string; period: string; target: number; progress: number; reward: number; completed: boolean; claimed: boolean }>
  const sponsorOffers = await eligibleSponsorOffers(c)
  const activeCycle = biweeklyId(now)
  const closedCycle = new Date(Date.parse(`${activeCycle}T00:00:00Z`) - CYCLE_MS).toISOString().slice(0, 10)
  const [leaderboardSnapshot] = await sql`WITH ranked AS (
      SELECT cs.cycle_id,row_number() OVER (PARTITION BY cs.cycle_id ORDER BY cs.trophies DESC,cs.user_id)::integer AS rank,
        u.display_name AS name,cs.trophies,cs.user_id,(cs.user_id=${activeSession.user_id}) AS is_current_user
      FROM cycle_scores cs JOIN users u ON u.id=cs.user_id WHERE cs.cycle_id IN (${activeCycle},${closedCycle})
    ), top_rows AS (
      SELECT * FROM ranked WHERE (cycle_id=${activeCycle} AND rank<=100) OR (cycle_id=${closedCycle} AND rank<=20)
    ) SELECT
      COALESCE(jsonb_agg(jsonb_build_object('rank',rank,'name',name,'trophies',trophies,'isCurrent',is_current_user) ORDER BY rank)
        FILTER (WHERE cycle_id=${activeCycle}),'[]'::jsonb) AS active,
      COALESCE(jsonb_agg(jsonb_build_object('rank',rank,'name',name,'trophies',trophies) ORDER BY rank)
        FILTER (WHERE cycle_id=${closedCycle}),'[]'::jsonb) AS closed,
      (SELECT jsonb_build_object('rank',rank,'name',name,'trophies',trophies)
        FROM ranked WHERE cycle_id=${activeCycle} AND is_current_user) AS current_player,
      max(rank) FILTER (WHERE cycle_id=${closedCycle} AND is_current_user) AS user_rank,
      COALESCE(bool_or(is_current_user AND EXISTS(SELECT 1 FROM reward_redemptions r
        WHERE r.user_id=top_rows.user_id AND r.cycle_id=${closedCycle} AND r.status<>'cancelled'))
        FILTER (WHERE cycle_id=${closedCycle}),false) AS redeemed
      ,(SELECT r.delivery_status FROM reward_redemptions r WHERE r.user_id=${activeSession.user_id} AND r.cycle_id=${closedCycle}
        AND r.status<>'cancelled' ORDER BY r.created_at DESC LIMIT 1) AS reward_delivery_status
    FROM top_rows`
  return c.json({
    success: true,
    csrfToken,
    me: { user: { id: user.id, displayName: user.display_name }, trophies: Number(user.trophies), personalBest: user.personal_best, referralCode: user.referral_code, rewardEmail: user.reward_email, rewardEmailVerified: Boolean(user.reward_email_verified_at), giftChoice: user.gift_choice },
    quests: quests.filter((row) => row.type !== 'cpa_1').map((row) => serializedQuest(row, sponsorOffers)),
    leaderboard: { active: leaderboardSnapshot.active, closed: leaderboardSnapshot.closed, currentPlayer: leaderboardSnapshot.current_player, cycle: activeCycle },
    eligibility: { eligible: leaderboardSnapshot.user_rank !== null, rank: leaderboardSnapshot.user_rank ?? null, cycle: closedCycle, rewardEmail: user.reward_email, giftChoice: user.gift_choice, redeemed: leaderboardSnapshot.redeemed, deliveryStatus: leaderboardSnapshot.reward_delivery_status ?? null },
    referral: { referralCode: user.referral_code, referralUrl: `${c.env.PUBLIC_ORIGIN}/?ref=${encodeURIComponent(user.referral_code)}` },
    rewardStock: snapshot.reward_stock as Record<RewardType, number>,
  })
})

async function requireSession(c: AppContext) {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return false
  const sql = sqlFor(c.env)
  const hash = await sha256(token)
  const rows = await sql`SELECT s.id, s.user_id, s.csrf_hash FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=${hash} AND s.expires_at > now() AND s.revoked_at IS NULL AND u.disabled_at IS NULL LIMIT 1`
  const session = rows[0] as { id: string; user_id: string; csrf_hash: string } | undefined
  if (!session) return false
  c.set('userId', session.user_id)
  c.set('sessionId', session.id)
  c.set('csrfHash', session.csrf_hash)
  return true
}

async function requireCsrf(c: AppContext) {
  const supplied = c.req.header('X-CSRF-Token')
  if (!supplied || !await requireSession(c)) return false
  return constantTimeStringEqual(await sha256(supplied), c.get('csrfHash'))
}

function requireAdminOrigin(c: AppContext) {
  if (c.req.header('Origin') !== ADMIN_ORIGIN) {
    return c.json({ error: 'Forbidden', code: 'ADMIN_ORIGIN_DENIED' }, 403)
  }
  return null
}

async function requireAdmin(c: AppContext) {
  if (requireAdminOrigin(c)) return null
  const token = getCookie(c, ADMIN_SESSION_COOKIE)
  if (!token) return null
  const [session] = await sqlFor(c.env)`SELECT id,username FROM admin_sessions
    WHERE token_hash=${await sha256(token)} AND expires_at > now() AND revoked_at IS NULL LIMIT 1`
  return session as { id: string; username: string } | undefined ?? null
}

function adminCookieOptions() {
  return { httpOnly: true as const, secure: true as const, sameSite: 'Strict' as const, path: '/api/admin', maxAge: ADMIN_SESSION_TTL_SECONDS }
}

function prepareAdminDelivery(c: AppContext, redemptionId: string, onlyRejected: boolean) {
  const sql = sqlFor(c.env)
  return onlyRejected
    ? sql`UPDATE reward_redemptions r SET status='sending',delivery_status='sending',
        delivery_attempt=r.delivery_attempt+1,idempotency_key=r.id::text||'/attempt/'||(r.delivery_attempt+1)::text,
        failure_info='attempt_in_progress',delivery_updated_at=now(),updated_at=now()
      FROM reward_codes code
      WHERE r.id=${redemptionId} AND r.delivery_status='rejected' AND code.id=r.reward_code_id
        AND code.status='reserved'
      RETURNING r.id,r.status,r.delivery_status,r.idempotency_key,r.delivery_attempt,r.recipient_email,r.reward_type,
        code.encrypted_code,code.iv,code.authentication_tag`
    : sql`UPDATE reward_redemptions r SET status='sending',delivery_status='sending',
        failure_info='attempt_in_progress',delivery_updated_at=now(),updated_at=now()
      FROM reward_codes code
      WHERE r.id=${redemptionId} AND r.delivery_status='reserved' AND code.id=r.reward_code_id
        AND code.status='reserved'
      RETURNING r.id,r.status,r.delivery_status,r.idempotency_key,r.delivery_attempt,r.recipient_email,r.reward_type,
        code.encrypted_code,code.iv,code.authentication_tag`
}

async function sendReservedRedemption(c: AppContext, redemption: RewardRedemption) {
  if (!c.env.REWARD_ENCRYPTION_KEY || !c.env.RESEND_API_KEY || !c.env.RESEND_FROM_EMAIL || !c.env.RESEND_WEBHOOK_SECRET) {
    return c.json({ error: 'Reward email delivery configuration is incomplete.', code: 'REWARD_CONFIG_MISSING' }, 503)
  }
  let code: string
  try {
    code = await decryptRewardCode({ encryptedCode: redemption.encrypted_code, iv: redemption.iv, authenticationTag: redemption.authentication_tag }, redemption.reward_type, c.env.REWARD_ENCRYPTION_KEY)
  } catch {
    await sqlFor(c.env)`UPDATE reward_redemptions SET status='failed',delivery_status='rejected',failure_info='code_decryption_failed',delivery_updated_at=now(),updated_at=now() WHERE id=${redemption.id}`
    return c.json({ error: 'The reserved reward could not be prepared. Contact support.', code: 'REWARD_CODE_UNAVAILABLE' }, 503)
  }
  const message = rewardEmailTemplate(code, redemption.reward_type)
  const outcome = await sendRewardEmail({ apiKey: c.env.RESEND_API_KEY, from: c.env.RESEND_FROM_EMAIL, to: redemption.recipient_email, ...message, idempotencyKey: redemption.idempotency_key })
  const sql = sqlFor(c.env)
  if (outcome.state === 'accepted') {
    await sql`UPDATE reward_redemptions SET status='sending',delivery_status='accepted',delivery_updated_at=now(),provider_message_id=${outcome.messageId},failure_info=NULL,updated_at=now() WHERE id=${redemption.id} AND delivery_status='sending'`
    return c.json({ success: true, status: 'accepted', redemptionId: redemption.id }, 202)
  }
  if (outcome.state === 'rejected') {
    await sql`UPDATE reward_redemptions SET status='failed',delivery_status='rejected',delivery_updated_at=now(),failure_info=${outcome.reason},updated_at=now() WHERE id=${redemption.id} AND delivery_status='sending'`
    return c.json({ error: 'The mail provider rejected delivery. You may retry this same redemption.', code: 'DELIVERY_REJECTED', status: 'rejected', redemptionId: redemption.id }, 502)
  }
  await sql`UPDATE reward_redemptions SET status='provider_unknown',delivery_status='provider_unknown',delivery_updated_at=now(),failure_info=${outcome.reason},updated_at=now() WHERE id=${redemption.id} AND delivery_status='sending'`
  return c.json({ error: 'Delivery status is unknown; reconcile with support before retrying.', code: 'PROVIDER_UNKNOWN', status: 'provider_unknown', redemptionId: redemption.id }, 202)
}

async function logSuspiciousRun(c: AppContext, runId: string | null, reason: string, evidenceHash: string | null) {
  const sql = sqlFor(c.env)
  let reasons = [reason]
  if (evidenceHash) {
    const [prior] = await sql`SELECT count(*)::integer AS count FROM suspicious_runs
      WHERE user_id=${c.get('userId')} AND evidence_hash=decode(${evidenceHash},'hex') AND created_at > now()-interval '24 hours'`
    if (Number(prior?.count ?? 0) >= 2) reasons.push('REPEATED_SUSPICIOUS_EVIDENCE')
  }
  await sql`INSERT INTO suspicious_runs(run_id,user_id,reason_codes,evidence_hash)
    VALUES(${runId},${c.get('userId')},${reasons},CASE WHEN ${evidenceHash}::text IS NULL THEN NULL ELSE decode(${evidenceHash},'hex') END)`
}

app.get('/api/me', async (c) => {
  if (!await requireSession(c)) return c.json({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401)
  const [user] = await sqlFor(c.env)`SELECT id,display_name,trophies,personal_best,referral_code,reward_email,reward_email_verified_at,gift_choice FROM users WHERE id=${c.get('userId')}`
  return c.json({ user: { id: user.id, displayName: user.display_name }, trophies: Number(user.trophies), personalBest: user.personal_best, referralCode: user.referral_code, rewardEmail: user.reward_email, rewardEmailVerified: Boolean(user.reward_email_verified_at), giftChoice: user.gift_choice })
})

app.post('/api/game/start', async (c) => {
  if (!await requireCsrf(c)) return c.json({ error: 'Session or CSRF token invalid', code: 'CSRF_DENIED' }, 403)
  const runToken = randomToken()
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]
  const [run] = await sqlFor(c.env)`INSERT INTO game_sessions(user_id,seed,run_token_hash,expires_at)
    VALUES(${c.get('userId')},${seed},${await sha256(runToken)},now()+interval '3 minutes')
    RETURNING run_id,seed,expires_at`
  return c.json({ runId: run.run_id, runToken, seed: String(run.seed), expiresAt: run.expires_at })
})

app.post('/api/game/end', async (c) => {
  if (!await requireCsrf(c)) return c.json({ error: 'Session or CSRF token invalid', code: 'CSRF_DENIED' }, 403)
  const reader = c.req.raw.body?.getReader()
  if (!reader) return c.json({ error: 'Missing request body', code: 'INVALID_BODY' }, 400)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 128_000) {
      await reader.cancel()
      return c.json({ error: 'Run evidence too large', code: 'EVIDENCE_TOO_LARGE' }, 413)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  let body: { runId?: string; runToken?: string; clientScore?: number; durationMs?: number; inputs?: unknown[]; website?: string; clientSignals?: unknown }
  try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch {
    await logSuspiciousRun(c, null, 'INVALID_JSON_BODY', null)
    return c.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    await logSuspiciousRun(c, null, 'INVALID_EVIDENCE_SHAPE', null)
    return c.json({ error: 'Run evidence must be an object', code: 'INVALID_BODY' }, 400)
  }
  const safeRunId = typeof body.runId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.runId) ? body.runId : null
  const canonical = JSON.stringify({ clientScore: body.clientScore, durationMs: body.durationMs, inputs: body.inputs })
  const evidenceHash = await sha256(canonical)
  if (Object.keys(body).some((key) => !['runId', 'runToken', 'clientScore', 'durationMs', 'inputs', 'website', 'clientSignals'].includes(key))) {
    await logSuspiciousRun(c, safeRunId, 'INVALID_EVIDENCE_SHAPE', evidenceHash)
    return c.json({ error: 'Run evidence has unexpected fields', code: 'INVALID_EVIDENCE' }, 422)
  }
  if (body.website !== undefined && body.website !== null && body.website !== '') {
    await logSuspiciousRun(c, safeRunId, 'HONEYPOT_FILLED', evidenceHash)
    return c.json({ error: 'Request rejected', code: 'REQUEST_REJECTED' }, 400)
  }
  const evidenceError = validateEvidence(body)
  if (evidenceError || !body.runId || !body.runToken) {
    if (evidenceError) await logSuspiciousRun(c, safeRunId, evidenceError, evidenceHash)
    return c.json({ error: 'Run evidence failed structural checks', code: evidenceError ?? 'INVALID_EVIDENCE' }, 422)
  }
  if (typeof body.runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.runId)
      || typeof body.runToken !== 'string' || !/^[0-9a-f]{64}$/i.test(body.runToken)) {
    await logSuspiciousRun(c, safeRunId, 'INVALID_RUN_CREDENTIAL_FORMAT', evidenceHash)
    return c.json({ error: 'Run credential format is invalid', code: 'INVALID_EVIDENCE' }, 422)
  }
  const tokenHash = await sha256(body.runToken)
  const clientSignals = sanitizeClientSignals(body.clientSignals, Array.isArray(body.inputs) ? body.inputs.length : 0)
  const clientSignalFlagsJson = JSON.stringify(clientSignals.flags)
  const sql = sqlFor(c.env)
  // The only accepted game events are a one-time, unexpired server session and
  // bounded evidence whose score cannot exceed the game's recorded forward inputs.
  // This is practical plausibility checking, not deterministic replay.
  const now = new Date()
  const dailyId = dayId(now)
  const weeklyId = weekId(now)
  const [recorded] = await sql`WITH consumed AS (
      UPDATE game_sessions SET used_at=now(),suspicion_flags=ARRAY(SELECT jsonb_array_elements_text(${clientSignalFlagsJson}::jsonb))
      WHERE run_id=${body.runId} AND user_id=${c.get('userId')} AND run_token_hash=${tokenHash}
        AND expires_at>now() AND used_at IS NULL
        AND extract(epoch FROM (now()-started_at))*1_000 >= ${body.durationMs}::double precision-${RUN_CLOCK_TOLERANCE_MS}::double precision
        AND extract(epoch FROM (now()-started_at))*1_000 <= ${body.durationMs}::double precision+${RUN_CLOCK_TOLERANCE_MS}::double precision
      RETURNING run_id,user_id
    ), stored AS (
      INSERT INTO game_runs(run_id,user_id,client_score,verified_score,duration_ms,evidence_hash,result_state)
      SELECT run_id,user_id,${body.clientScore},${body.clientScore},${body.durationMs},decode(${evidenceHash},'hex'),'verified' FROM consumed
      ON CONFLICT(run_id) DO NOTHING RETURNING run_id,user_id,verified_score
    ), activity AS (
      UPDATE quests q SET progress=LEAST(q.target,q.progress+1),completed=(LEAST(q.target,q.progress+1)>=q.target),updated_at=now()
      FROM stored s WHERE q.user_id=s.user_id AND ((q.cycle_type='daily' AND q.cycle_id=${dailyId} AND q.quest_type IN ('play_1','play_5'))
        OR (q.cycle_type='weekly' AND q.cycle_id=${weeklyId} AND q.quest_type='play_20')) AND q.progress<q.target
      RETURNING q.id,q.user_id,q.cycle_type,q.cycle_id,q.quest_type,q.target,q.progress,q.reward,q.completed,q.claimed
    ), eligible AS (
      SELECT s.user_id,s.verified_score,u.personal_best AS previous_best
      FROM stored s JOIN users u ON u.id=s.user_id
    ), user_update AS (
      UPDATE users u SET
        trophies=u.trophies+e.verified_score,
        personal_best=GREATEST(u.personal_best,e.verified_score),
        updated_at=now()
      FROM eligible e WHERE u.id=e.user_id
      RETURNING u.id,u.display_name,u.trophies,u.personal_best,u.referral_code,u.reward_email,u.reward_email_verified_at,u.gift_choice,
        e.verified_score,(e.previous_best IS NULL OR e.verified_score>e.previous_best) AS new_personal_best
    ), daily_pb AS (
      UPDATE quests q SET progress=LEAST(q.target,q.progress+1),completed=(LEAST(q.target,q.progress+1)>=q.target),updated_at=now()
      FROM user_update p WHERE p.new_personal_best AND q.user_id=p.id AND q.cycle_type='daily' AND q.cycle_id=${dailyId} AND q.quest_type='new_pb' AND q.progress<q.target
      RETURNING q.id,q.user_id,q.cycle_type,q.cycle_id,q.quest_type,q.target,q.progress,q.reward,q.completed,q.claimed
    ), score_quest AS (
      UPDATE quests q SET progress=GREATEST(q.progress,LEAST(q.target,p.verified_score)),completed=(GREATEST(q.progress,LEAST(q.target,p.verified_score))>=q.target),updated_at=now()
      FROM user_update p WHERE q.user_id=p.id AND q.cycle_type='weekly' AND q.cycle_id=${weeklyId} AND q.quest_type='score_1000'
        AND q.progress<q.target AND GREATEST(q.progress,LEAST(q.target,p.verified_score))>q.progress
      RETURNING q.id,q.user_id,q.cycle_type,q.cycle_id,q.quest_type,q.target,q.progress,q.reward,q.completed,q.claimed
    ), cycle_award AS (
      INSERT INTO cycle_scores(user_id,cycle_id,trophies)
      SELECT p.id,${biweeklyId(now)},p.verified_score FROM user_update p WHERE p.verified_score>0
      ON CONFLICT(user_id,cycle_id) DO UPDATE
        SET trophies=cycle_scores.trophies+EXCLUDED.trophies,updated_at=now()
      RETURNING user_id
    ), qualified AS (
      UPDATE referrals r SET qualified_at=now() FROM stored s
      WHERE r.referee_id=s.user_id AND r.qualified_at IS NULL RETURNING r.referrer_id
    ), referral_quest AS (
      INSERT INTO quests(id,user_id,cycle_type,cycle_id,quest_type,target,progress,completed,reward)
      SELECT 'weekly:'||${weeklyId}||':ref_2',referrer_id,'weekly',${weeklyId},'ref_2',2,1,false,10000 FROM qualified
      ON CONFLICT(user_id,cycle_type,cycle_id,quest_type) DO UPDATE
        SET progress=LEAST(quests.target,quests.progress+1),completed=(LEAST(quests.target,quests.progress+1)>=quests.target),updated_at=now()
        WHERE quests.claimed=false AND quests.progress<quests.target
      RETURNING id,user_id,cycle_type,cycle_id,quest_type,target,progress,reward,completed,claimed
    ), changed_quests AS (
      SELECT * FROM activity
      UNION ALL SELECT * FROM daily_pb
      UNION ALL SELECT * FROM score_quest
      UNION ALL SELECT * FROM referral_quest
    ) SELECT s.run_id,s.verified_score,p.trophies AS total_trophies,
      jsonb_build_object('id',p.id,'displayName',p.display_name,'trophies',p.trophies,
        'personalBest',p.personal_best,'referralCode',p.referral_code,'rewardEmail',p.reward_email,'rewardEmailVerified',p.reward_email_verified_at IS NOT NULL,'giftChoice',p.gift_choice) AS me,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'type',q.quest_type,'period',q.cycle_type,'target',q.target,
        'progress',q.progress,'reward',q.reward,'completed',q.completed,'claimed',q.claimed)
        ORDER BY q.cycle_type,q.quest_type),'[]'::jsonb)
       FROM (SELECT q.id,q.user_id,q.cycle_type,q.cycle_id,q.quest_type,q.target,q.progress,q.reward,q.completed,q.claimed
         FROM quests q WHERE q.user_id=s.user_id AND
           ((q.cycle_type='daily' AND q.cycle_id=${dailyId}) OR (q.cycle_type='weekly' AND q.cycle_id=${weeklyId}))
           AND NOT EXISTS (SELECT 1 FROM changed_quests changed WHERE changed.id=q.id)
         UNION ALL SELECT id,user_id,cycle_type,cycle_id,quest_type,target,progress,reward,completed,claimed
           FROM changed_quests WHERE user_id=s.user_id) q) AS quests,
      (SELECT count(*) FROM activity) AS activity_events,
      (SELECT count(*) FROM daily_pb) AS daily_pb_events,(SELECT count(*) FROM score_quest) AS score_quest_events,
      (SELECT count(*) FROM referral_quest) AS referral_events,
      (SELECT count(*) FROM cycle_award) AS leaderboard_events
      FROM stored s JOIN user_update p ON p.id=s.user_id`
  if (!recorded) {
    const [prior] = safeRunId ? await sql`SELECT gs.used_at,gs.expires_at,
        (gs.run_token_hash=${tokenHash}) AS token_matches,(gs.expires_at>now()) AS not_expired,
        (extract(epoch FROM (now()-gs.started_at))*1_000 >= ${body.durationMs}::double precision-${RUN_CLOCK_TOLERANCE_MS}::double precision
          AND extract(epoch FROM (now()-gs.started_at))*1_000 <= ${body.durationMs}::double precision+${RUN_CLOCK_TOLERANCE_MS}::double precision) AS duration_matches,
        encode(gr.evidence_hash,'hex') AS evidence_hash
      FROM game_sessions gs LEFT JOIN game_runs gr ON gr.run_id=gs.run_id
      WHERE gs.run_id=${safeRunId} AND gs.user_id=${c.get('userId')} LIMIT 1` : []
    const reasons = prior?.used_at
      ? [prior.evidence_hash && prior.evidence_hash !== evidenceHash ? 'RETRY_EVIDENCE_CHANGED' : 'RUN_REUSED']
      : !prior || !prior.token_matches ? ['RUN_TOKEN_INVALID']
      : !prior.not_expired ? ['RUN_EXPIRED']
      : !prior.duration_matches ? ['RUN_DURATION_MISMATCH'] : ['RUN_INVALID_STATE']
    await logSuspiciousRun(c, safeRunId, reasons[0], evidenceHash)
    return c.json({ error: 'Run token is invalid, expired, or already used', code: 'RUN_INVALID' }, 409)
  }
  const progress = recorded.me as { id: string; displayName: string; trophies: number; personalBest: number | null; referralCode: string; rewardEmail: string | null; rewardEmailVerified: boolean; giftChoice: string | null }
  const stateQuests = recorded.quests as Array<{ id: string; type: string; period: string; target: number; progress: number; reward: number; completed: boolean; claimed: boolean }>
  return c.json({
    accepted: true,
    verification: 'plausibility_checked',
    awarded: Number(recorded.verified_score) > 0,
    score: recorded.verified_score,
    trophiesEarned: Number(recorded.verified_score),
    totalTrophies: Number(recorded.total_trophies),
    state: {
      me: { user: { id: progress.id, displayName: progress.displayName }, trophies: Number(progress.trophies), personalBest: progress.personalBest, referralCode: progress.referralCode, rewardEmail: progress.rewardEmail, rewardEmailVerified: progress.rewardEmailVerified, giftChoice: progress.giftChoice },
      quests: stateQuests.filter((row) => row.type !== 'cpa_1').map((row) => serializedQuest(row as unknown as Parameters<typeof serializedQuest>[0])),
    },
  })
})

app.get('/api/quests', async (c) => {
  if (!await requireSession(c)) return c.json({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401)
  const now = new Date()
  const [rows, offers] = await Promise.all([
    sqlFor(c.env)`WITH reward_updates AS (
      UPDATE quests SET reward=CASE WHEN cycle_type='daily' AND quest_type='sponsor_app' THEN 60000
        WHEN cycle_type='weekly' AND quest_type='ppi_3' THEN 200000 ELSE reward END,updated_at=now()
      WHERE user_id=${c.get('userId')} AND claimed=false
        AND ((cycle_type='daily' AND cycle_id=${dayId(now)} AND quest_type='sponsor_app')
          OR (cycle_type='weekly' AND cycle_id=${weekId(now)} AND quest_type='ppi_3'))
        AND reward IS DISTINCT FROM CASE WHEN cycle_type='daily' AND quest_type='sponsor_app' THEN 60000 ELSE 200000 END
      RETURNING id,quest_type AS type,cycle_type AS period,target,progress,reward,completed,claimed
    ), quest_rows AS (
      SELECT id,quest_type AS type,cycle_type AS period,target,progress,reward,completed,claimed FROM quests
      WHERE user_id=${c.get('userId')} AND quest_type<>'cpa_1' AND ((cycle_type='daily' AND cycle_id=${dayId(now)}) OR (cycle_type='weekly' AND cycle_id=${weekId(now)}))
        AND id NOT IN (SELECT id FROM reward_updates)
      UNION ALL SELECT id,type,period,target,progress,reward,completed,claimed FROM reward_updates
    ) SELECT * FROM quest_rows ORDER BY period,type`,
    eligibleSponsorOffers(c),
  ])
  return c.json(rows.map((row) => serializedQuest(row as unknown as Parameters<typeof serializedQuest>[0], offers)))
})

app.post('/api/quests/:questId/claim', async (c) => {
  if (!await requireCsrf(c)) return c.json({ error: 'Session or CSRF token invalid', code: 'CSRF_DENIED' }, 403)
  const questId = c.req.param('questId')
  if (questId.length > 100) return c.json({ error: 'Invalid quest', code: 'INVALID_QUEST' }, 400)
  const sql = sqlFor(c.env)
  const now = new Date()
  const cycle = questId.startsWith('daily:') ? dayId(now) : weekId(now)
  const period = questId.startsWith('daily:') ? 'daily' : 'weekly'
  const [claim] = await sql`WITH target AS MATERIALIZED (
      SELECT user_id,cycle_type,cycle_id,quest_type,reward FROM quests WHERE id=${questId} AND user_id=${c.get('userId')}
        AND cycle_type=${period} AND cycle_id=${cycle} AND completed=true AND claimed=false FOR UPDATE
    ), claimed AS (
      UPDATE quests q SET claimed=true,updated_at=now() FROM target t
      WHERE q.user_id=t.user_id AND q.cycle_type=t.cycle_type AND q.cycle_id=t.cycle_id AND q.quest_type=t.quest_type
      RETURNING q.id,q.user_id,q.cycle_id,q.cycle_type,q.quest_type,q.target,q.progress,q.reward,q.completed,q.claimed
    ), wallet AS (
      UPDATE users u SET trophies=u.trophies+c.reward,updated_at=now() FROM claimed c
      WHERE u.id=c.user_id RETURNING u.id,u.trophies,c.cycle_id,c.reward
    ), score AS (
      INSERT INTO cycle_scores(user_id,cycle_id,trophies)
      SELECT id,cycle_id,reward FROM wallet ON CONFLICT(user_id,cycle_id)
      DO UPDATE SET trophies=cycle_scores.trophies+EXCLUDED.trophies,updated_at=now()
      RETURNING user_id
    ) SELECT wallet.reward AS awarded,wallet.trophies AS total,claimed.id AS quest_id,claimed.progress,
        claimed.target,claimed.completed,claimed.claimed,claimed.quest_type,claimed.cycle_type
      FROM wallet JOIN score ON score.user_id=wallet.id CROSS JOIN claimed`
  if (!claim) return c.json({ error: 'Quest is not claimable or has already been claimed', code: 'QUEST_NOT_CLAIMABLE' }, 409)
  const definition = QUESTS.find((quest) => quest.type === claim.quest_type)
  return c.json({ success: true, quest: { id: claim.quest_id, title: definition?.title ?? claim.quest_type, description: definition?.description, period: claim.cycle_type, progress: claim.progress, target: claim.target, reward: claim.awarded, completed: claim.completed, claimed: claim.claimed }, trophiesAwarded: claim.awarded, totalTrophies: Number(claim.total) })
})

app.post('/api/sponsor/offers/start', async (c) => {
  if (!await requireCsrf(c)) return c.json({ error: 'Session or CSRF token invalid', code: 'CSRF_DENIED' }, 403)
  if (!c.env.CPALEAD_PUBLISHER_ID || !c.env.CPALEAD_POSTBACK_PASSWORD) return c.json({ error: 'Sponsor offers are not configured yet.', code: 'SPONSOR_OFFERS_DISABLED' }, 503)
  const body = await c.req.json().catch(() => null) as { offerId?: unknown } | null
  if (typeof body?.offerId !== 'string' || !/^\d{1,16}$/.test(body.offerId) || !SPONSOR_CAMPAIGNS[body.offerId]) return c.json({ error: 'Offer is unavailable.', code: 'SPONSOR_OFFER_UNAVAILABLE' }, 404)
  const [feed, eligible] = await Promise.all([cpaleadOffers(c.env), eligibleSponsorOffers(c)])
  const offer = feed.find((item) => String(item.id) === body.offerId)
  const publicOffer = eligible.find((item) => item.id === body.offerId)
  if (!offer || !publicOffer || typeof offer.link !== 'string') return c.json({ error: 'This sponsor offer is not available for your location or device.', code: 'SPONSOR_OFFER_UNAVAILABLE' }, 404)
  const clickId = crypto.randomUUID()
  const trackingUrl = appendSponsorSubid(offer.link, c.env.CPALEAD_PUBLISHER_ID, body.offerId, clickId)
  if (!trackingUrl) return c.json({ error: 'Offer tracking could not be prepared.', code: 'SPONSOR_TRACKING_UNAVAILABLE' }, 503)
  const country = (c.req.raw as Request & { cf?: { country?: string } }).cf?.country ?? ''
  await sqlFor(c.env)`INSERT INTO mylead_clicks(click_id,user_id,provider_metadata)
    VALUES(${clickId},${c.get('userId')},jsonb_build_object('provider','cpalead','campaign_id',${body.offerId},
      'event_type',${publicOffer.type.toLowerCase()},'country',${country.toUpperCase()}))`
  return c.json({ success: true, url: trackingUrl })
})

app.get('/webhooks/cpalead', async (c) => {
  if (!c.env.CPALEAD_POSTBACK_PASSWORD) return c.text('Not configured', 503)
  const address = c.req.header('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(c.env.MUTATION_RATE_LIMIT, rateLimitKey(address))) return c.text('Retry later', 429)
  const { subid = '', lead_id: leadId = '', campaign_id: campaignId = '', country_iso: country = '', password = '' } = c.req.query()
  if (c.req.url.length > 2_048 || !(await constantTimeStringEqual(password, c.env.CPALEAD_POSTBACK_PASSWORD))) return c.text('Invalid postback', 403)
  const normalizedCountry = country.toUpperCase()
  if (!isValidSponsorPostbackId(subid) || !/^\d{1,20}$/.test(leadId) || !/^\d{1,16}$/.test(campaignId)
    || !SPONSOR_CAMPAIGNS[campaignId] || !/^[A-Z]{2}$/.test(normalizedCountry)
    || !isAllowedSponsorTarget(campaignId, normalizedCountry)) return c.text('Invalid postback', 400)

  const now = new Date()
  const dailyId = dayId(now)
  const weeklyId = weekId(now)
  const [result] = await sqlFor(c.env)`WITH click AS MATERIALIZED (
      SELECT user_id,provider_metadata->>'event_type' AS event_type
      FROM mylead_clicks
      WHERE click_id=${subid} AND provider_metadata->>'provider'='cpalead'
        AND provider_metadata->>'campaign_id'=${campaignId}
        AND created_at > now()-interval '30 days'
      LIMIT 1
    ), conversion AS (
      INSERT INTO provider_conversions(provider,transaction_id,user_id,event_type,status,reward_metadata)
      SELECT 'cpalead',${leadId},click.user_id,click.event_type,'verified',
        jsonb_build_object('campaign_id',${campaignId},'country_iso',${normalizedCountry})
      FROM click WHERE click.event_type IN ('cpa','cpi','ppi')
      ON CONFLICT(provider,transaction_id) DO NOTHING
      RETURNING user_id
    ), daily_progress AS (
      UPDATE quests q SET progress=LEAST(q.target,q.progress+1),completed=(LEAST(q.target,q.progress+1)>=q.target),updated_at=now()
      FROM conversion cv WHERE q.user_id=cv.user_id AND q.cycle_type='daily' AND q.cycle_id=${dailyId}
        AND q.quest_type='sponsor_app' AND q.claimed=false AND q.progress<q.target
      RETURNING q.id
    ), weekly_progress AS (
      UPDATE quests q SET progress=LEAST(q.target,q.progress+1),completed=(LEAST(q.target,q.progress+1)>=q.target),updated_at=now()
      FROM conversion cv WHERE q.user_id=cv.user_id AND q.cycle_type='weekly' AND q.cycle_id=${weeklyId}
        AND q.quest_type='ppi_3' AND q.claimed=false AND q.progress<q.target
      RETURNING q.id
    ) SELECT (SELECT user_id FROM click LIMIT 1) AS user_id,
        EXISTS(SELECT 1 FROM conversion) AS inserted,
        (SELECT count(*) FROM daily_progress)::integer AS daily_updated,
        (SELECT count(*) FROM weekly_progress)::integer AS weekly_updated`
  if (!result?.user_id) return c.text('Unknown offer attribution', 404)
  // CPAlead may retry a valid callback; the unique provider/lead key makes retries no-ops.
  return c.text(result.inserted ? 'OK' : 'OK duplicate', 200)
})

app.get('/api/leaderboard', async (c) => {
  if (!await requireSession(c)) return c.json({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401)
  const active = biweeklyId(new Date())
  const closed = new Date(Date.parse(`${active}T00:00:00Z`) - CYCLE_MS).toISOString().slice(0, 10)
  const sql = sqlFor(c.env)
  const [activeRows, closedRows] = await Promise.all([
    sql`WITH ranked AS (
      SELECT row_number() OVER(ORDER BY cs.trophies DESC,cs.user_id)::integer AS rank,u.display_name AS name,cs.trophies,
        (cs.user_id=${c.get('userId')}) AS is_current_user
      FROM cycle_scores cs JOIN users u ON u.id=cs.user_id WHERE cycle_id=${active}
    ) SELECT COALESCE(jsonb_agg(jsonb_build_object('rank',rank,'name',name,'trophies',trophies,'isCurrent',is_current_user) ORDER BY rank)
        FILTER (WHERE rank<=100),'[]'::jsonb) AS active,
      (SELECT jsonb_build_object('rank',rank,'name',name,'trophies',trophies) FROM ranked WHERE is_current_user) AS current_player
      FROM ranked`,
    sql`SELECT row_number() OVER(ORDER BY cs.trophies DESC,cs.user_id)::integer AS rank,u.display_name AS name,cs.trophies FROM cycle_scores cs JOIN users u ON u.id=cs.user_id WHERE cycle_id=${closed} ORDER BY cs.trophies DESC,cs.user_id LIMIT 20`,
  ])
  return c.json({ active: activeRows[0]?.active ?? [], closed: closedRows, currentPlayer: activeRows[0]?.current_player ?? null, cycle: active })
})

app.get('/api/rewards/eligibility', async (c) => {
  if (!await requireSession(c)) return c.json({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401)
  const active = biweeklyId(new Date())
  const closed = new Date(Date.parse(`${active}T00:00:00Z`) - CYCLE_MS).toISOString().slice(0, 10)
  const [row] = await sqlFor(c.env)`SELECT ranked.rank,EXISTS(SELECT 1 FROM reward_redemptions r
      WHERE r.user_id=ranked.user_id AND r.cycle_id=${closed} AND r.status <> 'cancelled') AS redeemed
    FROM (SELECT cs.user_id,row_number() OVER(ORDER BY cs.trophies DESC,cs.user_id)::integer AS rank
      FROM cycle_scores cs WHERE cs.cycle_id=${closed}
      ORDER BY cs.trophies DESC,cs.user_id LIMIT 20) ranked WHERE ranked.user_id=${c.get('userId')}`
  return c.json({ eligible: Boolean(row), rank: row?.rank ?? null, cycle: closed, redeemed: row?.redeemed ?? false })
})

app.get('/api/referral/link', async (c) => {
  if (!await requireSession(c)) return c.json({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401)
  const [user] = await sqlFor(c.env)`SELECT referral_code FROM users WHERE id=${c.get('userId')}`
  return c.json({ referralCode: user.referral_code, referralUrl: `${c.env.PUBLIC_ORIGIN}/?ref=${encodeURIComponent(user.referral_code)}` })
})

app.post('/api/rewards/email', async (c) => {
  if (!await requireCsrf(c)) return c.json({ error: 'Session or CSRF token invalid', code: 'CSRF_DENIED' }, 403)
  let body: { email?: string; giftChoice?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, 400) }
  const email = body.email?.trim().toLowerCase()
  const choices = new Set(['robux','freefire','vbucks','pubg','cod'])
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !body.giftChoice || !choices.has(body.giftChoice)) return c.json({ error: 'Valid email and reward category required', code: 'INVALID_REWARD_DETAILS' }, 400)
  const sql = sqlFor(c.env)
  const verificationToken = randomToken()
  const verificationHash = await sha256(verificationToken)
  const verificationExpires = new Date(Date.now() + 30 * 60 * 1_000).toISOString()
  const [result] = await sql`WITH current AS MATERIALIZED (
      SELECT id,reward_email,gift_choice,reward_email_change_count,reward_email_window_started_at,reward_email_verified_at,
        reward_email_verification_token_hash,reward_email_verification_expires_at
      FROM users WHERE id=${c.get('userId')} FOR UPDATE
    ), updated AS (
      UPDATE users u SET reward_email=${email},gift_choice=${body.giftChoice},
        reward_email_change_count=CASE
          WHEN old.reward_email IS NOT DISTINCT FROM ${email} THEN old.reward_email_change_count
          WHEN old.reward_email_window_started_at IS NULL OR old.reward_email_window_started_at <= now()-interval '7 days' THEN 1
          ELSE old.reward_email_change_count+1 END,
        reward_email_window_started_at=CASE
          WHEN old.reward_email IS NOT DISTINCT FROM ${email} THEN old.reward_email_window_started_at
          WHEN old.reward_email_window_started_at IS NULL OR old.reward_email_window_started_at <= now()-interval '7 days' THEN now()
          ELSE old.reward_email_window_started_at END,
        reward_email_verified_at=CASE WHEN old.reward_email IS DISTINCT FROM ${email} THEN NULL ELSE old.reward_email_verified_at END,
        reward_email_verification_token_hash=CASE WHEN old.reward_email IS DISTINCT FROM ${email}
          OR (old.reward_email_verified_at IS NULL AND (old.reward_email_verification_token_hash IS NULL OR old.reward_email_verification_expires_at<=now()))
          THEN ${verificationHash} ELSE old.reward_email_verification_token_hash END,
        reward_email_verification_expires_at=CASE WHEN old.reward_email IS DISTINCT FROM ${email}
          OR (old.reward_email_verified_at IS NULL AND (old.reward_email_verification_token_hash IS NULL OR old.reward_email_verification_expires_at<=now()))
          THEN ${verificationExpires} ELSE old.reward_email_verification_expires_at END,
        updated_at=now()
      FROM current old WHERE u.id=old.id AND (old.reward_email IS NOT DISTINCT FROM ${email}
        OR old.reward_email_window_started_at IS NULL OR old.reward_email_window_started_at <= now()-interval '7 days'
        OR old.reward_email_change_count < 3)
        AND (old.reward_email IS DISTINCT FROM ${email} OR old.gift_choice IS DISTINCT FROM ${body.giftChoice} OR old.reward_email_verified_at IS NULL)
      RETURNING u.reward_email,u.gift_choice,u.reward_email_verified_at,(u.reward_email_verification_token_hash=${verificationHash}) AS should_send_verification
    ) SELECT reward_email,gift_choice,reward_email_verified_at,should_send_verification FROM updated
      UNION ALL SELECT reward_email,gift_choice,reward_email_verified_at,false AS should_send_verification FROM current
        WHERE reward_email IS NOT DISTINCT FROM ${email} AND gift_choice IS NOT DISTINCT FROM ${body.giftChoice}
      LIMIT 1`
  if (!result) return c.json({ error: 'Only three reward email changes are allowed per seven days', code: 'EMAIL_CHANGE_LIMIT' }, 429)
  if (result.reward_email_verified_at) return c.json({ success: true, rewardEmail: result.reward_email, giftChoice: result.gift_choice, emailVerified: true, verificationStatus: 'verified' })
  if (c.env.REWARD_EMAIL_DELIVERY_ENABLED !== 'true' || !c.env.RESEND_API_KEY || !c.env.RESEND_FROM_EMAIL) {
    return c.json({ success: true, rewardEmail: result.reward_email, giftChoice: result.gift_choice, emailVerified: false, verificationStatus: 'not_configured' })
  }
  if (!result.should_send_verification) {
    return c.json({ success: true, rewardEmail: result.reward_email, giftChoice: result.gift_choice, emailVerified: false, verificationStatus: 'pending' }, 202)
  }
  const verifyUrl = `${c.env.PUBLIC_ORIGIN}/#verify_reward_email=${verificationToken}`
  const message = rewardEmailVerificationTemplate(verifyUrl)
  const outcome = await sendRewardEmail({ apiKey: c.env.RESEND_API_KEY, from: c.env.RESEND_FROM_EMAIL, to: result.reward_email, ...message, idempotencyKey: `reward-email-verify:${verificationHash}` })
  if (outcome.state === 'accepted') return c.json({ success: true, rewardEmail: result.reward_email, giftChoice: result.gift_choice, emailVerified: false, verificationStatus: 'sent' })
  if (outcome.state === 'provider_unknown') return c.json({ success: true, rewardEmail: result.reward_email, giftChoice: result.gift_choice, emailVerified: false, verificationStatus: 'pending' }, 202)
  await sql`UPDATE users SET reward_email_verification_token_hash=NULL,reward_email_verification_expires_at=NULL
    WHERE id=${c.get('userId')} AND reward_email_verification_token_hash=${verificationHash} AND reward_email_verified_at IS NULL`
  return c.json({ error: 'Verification email was rejected. Save the same address again to request another link.', code: 'EMAIL_VERIFICATION_REJECTED' }, 502)
})

app.post('/api/rewards/email/verify', async (c) => {
  const origin = c.req.header('Origin')
  if (!origin || !['https://dashcup.com','https://www.dashcup.com'].includes(origin)) return c.json({ error: 'Origin is not allowed', code: 'ORIGIN_DENIED' }, 403)
  const body = await c.req.json().catch(() => null) as { token?: unknown } | null
  if (typeof body?.token !== 'string' || !/^[a-f0-9]{64}$/i.test(body.token)) return c.json({ error: 'Verification link is invalid or expired.', code: 'EMAIL_VERIFICATION_INVALID' }, 400)
  const [verified] = await sqlFor(c.env)`UPDATE users SET reward_email_verified_at=now(),reward_email_verification_token_hash=NULL,
      reward_email_verification_expires_at=NULL,updated_at=now()
    WHERE reward_email_verification_token_hash=${await sha256(body.token)} AND reward_email_verification_expires_at>now()
    RETURNING id`
  if (!verified) return c.json({ error: 'Verification link is invalid or expired. Request a new link from Rewards.', code: 'EMAIL_VERIFICATION_INVALID' }, 400)
  return c.json({ success: true, emailVerified: true })
})

app.post('/api/rewards/redeem', async (c) => {
  if (!await requireCsrf(c)) return c.json({ error: 'Session or CSRF token invalid', code: 'CSRF_DENIED' }, 403)
  if (c.env.REWARD_EMAIL_DELIVERY_ENABLED !== 'true' || !c.env.REWARD_ENCRYPTION_KEY || !c.env.RESEND_API_KEY || !c.env.RESEND_FROM_EMAIL || !c.env.RESEND_WEBHOOK_SECRET) return c.json({ error: 'Reward delivery is not enabled for this environment.', code: 'REWARDS_DISABLED' }, 503)
  const body = await c.req.json().catch(() => null) as { giftChoice?: unknown } | null
  const choices = new Set<RewardType>(['robux', 'freefire', 'vbucks', 'pubg', 'cod'])
  if (typeof body?.giftChoice !== 'string' || !choices.has(body.giftChoice as RewardType)) return c.json({ error: 'Choose a valid reward category.', code: 'INVALID_REWARD_DETAILS' }, 400)
  const rewardType = body.giftChoice as RewardType
  const now = new Date()
  const activeCycle = biweeklyId(now)
  const closedCycle = new Date(Date.parse(`${activeCycle}T00:00:00Z`) - CYCLE_MS).toISOString().slice(0, 10)
  const sql = sqlFor(c.env)
  const priorRows = await sql`SELECT r.id,r.status,r.delivery_status,r.idempotency_key,r.delivery_attempt,r.recipient_email,r.reward_type,
      c.encrypted_code,c.iv,c.authentication_tag
    FROM reward_redemptions r JOIN reward_codes c ON c.id=r.reward_code_id
    WHERE r.user_id=${c.get('userId')} AND r.cycle_id=${closedCycle} LIMIT 1`
  let redemption = priorRows[0] as unknown as RewardRedemption | undefined
  if (redemption) {
    if (redemption.reward_type !== rewardType) return c.json({ error: 'This account already has a redemption for a different reward.', code: 'REWARD_CHOICE_MISMATCH' }, 409)
    if (redemption.status === 'cancelled') return c.json({ error: 'This reward redemption has been cancelled.', code: 'REDEMPTION_CANCELLED' }, 409)
    if (redemption.delivery_status === 'sent') return c.json({ success: true, status: 'sent', redemptionId: redemption.id })
    if (redemption.delivery_status === 'accepted') return c.json({ success: true, status: 'accepted', redemptionId: redemption.id }, 202)
    if (redemption.delivery_status === 'sending') return c.json({ success: true, status: 'sending', redemptionId: redemption.id }, 202)
    if (redemption.delivery_status === 'provider_unknown') return c.json({ error: 'Delivery status is unknown; please wait for confirmation.', code: 'PROVIDER_UNKNOWN', status: 'provider_unknown', redemptionId: redemption.id }, 202)
    if (redemption.delivery_status === 'rejected') {
      const [prepared] = await prepareAdminDelivery(c, redemption.id, true)
      if (!prepared) return c.json({ success: true, status: 'provider_unknown', redemptionId: redemption.id }, 202)
      redemption = prepared as unknown as RewardRedemption
    } else if (redemption.delivery_status === 'reserved') {
      const [prepared] = await prepareAdminDelivery(c, redemption.id, false)
      if (!prepared) return c.json({ success: true, status: 'provider_unknown', redemptionId: redemption.id }, 202)
      redemption = prepared as unknown as RewardRedemption
    } else {
      return c.json({ error: 'Redemption needs administrator reconciliation.', code: 'PROVIDER_UNKNOWN', status: 'provider_unknown', redemptionId: redemption.id }, 202)
    }
    return sendReservedRedemption(c, redemption)
  }

  const redemptionId = crypto.randomUUID()
  const [created] = await sql`WITH locked_user AS MATERIALIZED (
      SELECT id,reward_email,gift_choice FROM users WHERE id=${c.get('userId')} AND disabled_at IS NULL AND reward_email IS NOT NULL AND reward_email_verified_at IS NOT NULL FOR UPDATE
    ), eligible AS MATERIALIZED (
      SELECT cs.user_id FROM cycle_scores cs JOIN locked_user u ON u.id=cs.user_id WHERE cs.cycle_id=${closedCycle}
      AND u.gift_choice=${rewardType} AND (SELECT count(*) FROM cycle_scores top WHERE top.cycle_id=${closedCycle}
        AND (top.trophies>cs.trophies OR (top.trophies=cs.trophies AND top.user_id<=cs.user_id))) <= 20
    ), picked AS MATERIALIZED (
      SELECT code.id,slot.slot_number FROM reward_inventory_slots slot
      JOIN reward_codes code ON code.id=slot.reward_code_id
      WHERE slot.reward_type=${rewardType} AND code.reward_type=${rewardType} AND code.status='available'
      ORDER BY slot.slot_number FOR UPDATE OF slot,code SKIP LOCKED LIMIT 1
    ), inserted AS (
      INSERT INTO reward_redemptions(id,user_id,cycle_id,reward_type,reward_code_id,inventory_slot_number,recipient_email,status,idempotency_key,delivery_attempt)
      SELECT ${redemptionId},u.id,${closedCycle},${rewardType},p.id,p.slot_number,u.reward_email,'sending',${redemptionId},1
      FROM locked_user u JOIN eligible e ON e.user_id=u.id CROSS JOIN picked p
      ON CONFLICT(user_id,cycle_id) DO NOTHING
      RETURNING id,reward_code_id,inventory_slot_number,recipient_email,reward_type,status,delivery_status,idempotency_key,delivery_attempt
    ), reserved AS (
      UPDATE reward_codes code SET status='reserved',reserved_at=now()
      FROM inserted i WHERE code.id=i.reward_code_id RETURNING code.id
    ) SELECT i.id,i.status,i.delivery_status,i.idempotency_key,i.delivery_attempt,i.recipient_email,i.reward_type,
        code.encrypted_code,code.iv,code.authentication_tag
      FROM inserted i JOIN reserved held ON held.id=i.reward_code_id JOIN reward_codes code ON code.id=i.reward_code_id`
  redemption = created as unknown as RewardRedemption | undefined
  if (!redemption) {
    const [raced] = await sql`SELECT r.id,r.status,r.delivery_status,r.idempotency_key,r.delivery_attempt,r.recipient_email,r.reward_type,
      c.encrypted_code,c.iv,c.authentication_tag FROM reward_redemptions r JOIN reward_codes c ON c.id=r.reward_code_id
      WHERE r.user_id=${c.get('userId')} AND r.cycle_id=${closedCycle} LIMIT 1`
    if (!raced) return c.json({ error: 'No code is available for this reward. Currently unavailable — please try later.', code: 'REWARD_UNAVAILABLE' }, 409)
    redemption = raced as unknown as RewardRedemption
    if (redemption.reward_type !== rewardType) return c.json({ error: 'This account already has a redemption for a different reward.', code: 'REWARD_CHOICE_MISMATCH' }, 409)
    if (redemption.delivery_status !== 'reserved') return c.json({ success: true, status: redemption.delivery_status, redemptionId: redemption.id }, 202)
    const [prepared] = await prepareAdminDelivery(c, redemption.id, false)
    if (!prepared) return c.json({ success: true, status: 'provider_unknown', redemptionId: redemption.id }, 202)
    redemption = prepared as unknown as RewardRedemption
  } else {
    const [prepared] = await prepareAdminDelivery(c, redemption.id, false)
    if (!prepared) return c.json({ success: true, status: 'provider_unknown', redemptionId: redemption.id }, 202)
    redemption = prepared as unknown as RewardRedemption
  }
  return sendReservedRedemption(c, redemption)
})

app.post('/webhooks/resend', async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET
  if (!secret) return c.json({ error: 'Webhook is not configured', code: 'WEBHOOK_DISABLED' }, 503)
  const declaredLength = Number(c.req.header('Content-Length') ?? 0)
  if (declaredLength > 64_000) return c.json({ error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' }, 413)
  const eventId = c.req.header('svix-id') ?? ''
  const timestamp = c.req.header('svix-timestamp') ?? ''
  const signature = c.req.header('svix-signature') ?? ''
  const payload = await c.req.text()
  if (payload.length > 64_000 || !eventId || !timestamp || !signature || !await verifyResendSignature(secret, eventId, timestamp, signature, payload)) return c.json({ error: 'Invalid webhook signature', code: 'WEBHOOK_SIGNATURE_INVALID' }, 401)
  let event: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; id?: unknown } }
  try { event = JSON.parse(payload) } catch { return c.json({ error: 'Invalid webhook payload', code: 'WEBHOOK_INVALID' }, 400) }
  if (typeof event.type !== 'string') return c.json({ error: 'Invalid webhook payload', code: 'WEBHOOK_INVALID' }, 400)
  const emailId = typeof event.data?.email_id === 'string' ? event.data.email_id : typeof event.data?.id === 'string' ? event.data.id : null
  const sent = event.type === 'email.sent' || event.type === 'email.delivered'
  const rejected = ['email.failed', 'email.bounced', 'email.complained'].includes(event.type)
  if (!emailId || (!sent && !rejected)) return c.body(null, 204)
  const deliveryStatus = sent ? 'sent' : 'rejected'
  const redemptionStatus = sent ? 'sent' : 'failed'
  const sql = sqlFor(c.env)
  await sql`WITH received AS (
      INSERT INTO resend_webhook_events(event_id,event_type,event_created_at)
      VALUES(${eventId},${event.type},${typeof event.created_at === 'string' ? event.created_at : null})
      ON CONFLICT(event_id) DO NOTHING RETURNING event_id
    ), updated AS (
      UPDATE reward_redemptions r SET status=${redemptionStatus},delivery_status=${deliveryStatus},delivery_updated_at=now(),
        failure_info=CASE WHEN ${rejected} THEN ${event.type} ELSE NULL END,updated_at=now()
      FROM received w WHERE r.provider_message_id=${emailId} AND r.status IN ('sending','provider_unknown')
      RETURNING r.reward_code_id,r.status
    ), marked AS (
      UPDATE reward_codes c SET status=CASE WHEN u.status='sent' THEN 'delivered' ELSE c.status END,
        delivered_at=CASE WHEN u.status='sent' THEN now() ELSE c.delivered_at END
      FROM updated u WHERE c.id=u.reward_code_id RETURNING c.id
    ) SELECT count(*) FROM received`
  return c.body(null, 204)
})

app.get('/api/rewards/status', async (c) => {
  if (!await requireSession(c)) return c.json({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401)
  const active = biweeklyId(new Date())
  const closed = new Date(Date.parse(`${active}T00:00:00Z`) - CYCLE_MS).toISOString().slice(0, 10)
  const [row] = await sqlFor(c.env)`SELECT id,delivery_status,created_at,updated_at FROM reward_redemptions
    WHERE user_id=${c.get('userId')} AND cycle_id=${closed} ORDER BY created_at DESC LIMIT 1`
  return c.json({ status: row?.delivery_status ?? 'none', redemptionId: row?.id ?? null, updatedAt: row?.updated_at ?? null })
})

app.post('/api/admin/auth/login', async (c) => {
  if (requireAdminOrigin(c)) return c.json({ error: 'Forbidden', code: 'ADMIN_ORIGIN_DENIED' }, 403)
  if (!c.env.REWARD_ADMIN_USERNAME || !c.env.REWARD_ADMIN_PASSWORD_HASH) return c.json({ error: 'Admin sign-in is not configured.', code: 'ADMIN_NOT_CONFIGURED' }, 503)
  const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null
  if (typeof body?.username !== 'string' || typeof body.password !== 'string' || body.username.length > 128 || body.password.length > 1024) return c.json({ error: 'Username or password is incorrect.', code: 'ADMIN_LOGIN_FAILED' }, 401)
  let credentialsMatch = false
  try { credentialsMatch = await verifyAdminCredentials(body.username, body.password, c.env.REWARD_ADMIN_USERNAME, c.env.REWARD_ADMIN_PASSWORD_HASH) } catch { credentialsMatch = false }
  if (!credentialsMatch) return c.json({ error: 'Username or password is incorrect.', code: 'ADMIN_LOGIN_FAILED' }, 401)
  const token = randomToken()
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1_000).toISOString()
  await sqlFor(c.env)`INSERT INTO admin_sessions(username,token_hash,expires_at)
    VALUES(${c.env.REWARD_ADMIN_USERNAME},${await sha256(token)},${expiresAt})`
  setCookie(c, ADMIN_SESSION_COOKIE, token, adminCookieOptions())
  return c.json({ success: true, expiresAt })
})

app.get('/api/admin/session', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin sign-in required.', code: 'ADMIN_UNAUTHENTICATED' }, 401)
  return c.json({ authenticated: true, username: admin.username })
})

app.post('/api/admin/auth/logout', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin sign-in required.', code: 'ADMIN_UNAUTHENTICATED' }, 401)
  const token = getCookie(c, ADMIN_SESSION_COOKIE)
  if (token) await sqlFor(c.env)`UPDATE admin_sessions SET revoked_at=now() WHERE token_hash=${await sha256(token)} AND revoked_at IS NULL`
  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/api/admin', secure: true, sameSite: 'Strict' })
  return c.json({ success: true })
})

app.get('/api/admin/inventory', async (c) => {
  if (!await requireAdmin(c)) return c.json({ error: 'Admin sign-in required.', code: 'ADMIN_UNAUTHENTICATED' }, 401)
  const slots = await sqlFor(c.env)`SELECT slot.reward_type,slot.slot_number,code.status AS code_status,
      redemption.id AS redemption_id,redemption.delivery_status,redemption.failure_info,redemption.updated_at AS redemption_updated_at
    FROM reward_inventory_slots slot LEFT JOIN reward_codes code ON code.id=slot.reward_code_id
    LEFT JOIN reward_redemptions redemption ON redemption.reward_code_id=code.id
    ORDER BY slot.reward_type,slot.slot_number`
  const mapped = slots.map((row) => ({
    rewardType: row.reward_type as RewardType,
    slotNumber: Number(row.slot_number),
    status: row.code_status === null ? 'empty'
      : row.code_status === 'available' ? 'available'
        : row.code_status === 'delivered' ? 'used'
          : row.delivery_status === 'rejected' ? 'rejected'
    : row.delivery_status === 'provider_unknown' || (row.delivery_status === 'sending' && new Date(String(row.redemption_updated_at)).getTime() < Date.now() - 600_000) ? 'provider_unknown'
              : row.delivery_status === 'sending' ? 'sending'
              : row.delivery_status === 'accepted' ? 'accepted' : 'reserved',
    redemptionId: row.redemption_id ?? null,
    failureInfo: row.failure_info ?? null,
  }))
  return c.json({
    slots: mapped,
    delivery: {
      enabled: c.env.REWARD_EMAIL_DELIVERY_ENABLED === 'true',
      apiKeyConfigured: Boolean(c.env.RESEND_API_KEY),
      senderConfigured: Boolean(c.env.RESEND_FROM_EMAIL),
      webhookConfigured: Boolean(c.env.RESEND_WEBHOOK_SECRET),
      encryptionConfigured: Boolean(c.env.REWARD_ENCRYPTION_KEY),
      enabledAndConfigured: c.env.REWARD_EMAIL_DELIVERY_ENABLED === 'true' && Boolean(c.env.RESEND_API_KEY && c.env.RESEND_FROM_EMAIL && c.env.RESEND_WEBHOOK_SECRET && c.env.REWARD_ENCRYPTION_KEY),
    },
  })
})

app.post('/api/admin/inventory/:rewardType/:slotNumber', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin sign-in required.', code: 'ADMIN_UNAUTHENTICATED' }, 401)
  if (!c.env.REWARD_ENCRYPTION_KEY) return c.json({ error: 'Reward encryption is not configured.', code: 'REWARD_CONFIG_MISSING' }, 503)
  const rewardType = c.req.param('rewardType') as RewardType
  const choices = new Set<RewardType>(['robux', 'freefire', 'vbucks', 'pubg', 'cod'])
  const slotNumber = Number(c.req.param('slotNumber'))
  if (!choices.has(rewardType) || !Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 20) return c.json({ error: 'Invalid reward slot.', code: 'INVALID_SLOT' }, 400)
  const body = await c.req.json().catch(() => null) as { code?: unknown } | null
  if (typeof body?.code !== 'string' || !body.code.trim() || body.code.length > 256) return c.json({ error: 'Enter a redeem code up to 256 characters.', code: 'INVALID_REWARD_CODE' }, 400)
  const encrypted = await encryptRewardCode(body.code, rewardType, c.env.REWARD_ENCRYPTION_KEY)
  const [updated] = await sqlFor(c.env)`WITH locked AS MATERIALIZED (
      SELECT s.reward_type,s.slot_number,s.reward_code_id FROM reward_inventory_slots s
      WHERE s.reward_type=${rewardType} AND s.slot_number=${slotNumber} FOR UPDATE
    ), inserted AS (
      INSERT INTO reward_codes(reward_type,encrypted_code,iv,authentication_tag,fingerprint)
      SELECT ${rewardType},${encrypted.encryptedCode},${encrypted.iv},${encrypted.authenticationTag},${encrypted.fingerprint}
      FROM locked l WHERE l.reward_code_id IS NULL OR EXISTS(
        SELECT 1 FROM reward_codes prior WHERE prior.id=l.reward_code_id AND prior.status='delivered'
      )
      ON CONFLICT(fingerprint) DO NOTHING RETURNING id
    ), assigned AS (
      UPDATE reward_inventory_slots s SET reward_code_id=i.id,updated_at=now()
      FROM inserted i,locked l WHERE s.reward_type=l.reward_type AND s.slot_number=l.slot_number
        AND s.reward_code_id IS NOT DISTINCT FROM l.reward_code_id
      RETURNING s.reward_type,s.slot_number
    ) SELECT reward_type,slot_number FROM assigned`
  if (!updated) return c.json({ error: 'Slot is occupied or this code already exists. No changes were made.', code: 'SLOT_OR_DUPLICATE' }, 409)
  await sqlFor(c.env)`INSERT INTO audit_logs(action,target_type,target_id,metadata)
    VALUES('reward_code_import','reward_inventory_slot',${`${rewardType}:${slotNumber}`},jsonb_build_object('admin',${admin.username},'rewardType',${rewardType},'slotNumber',${slotNumber}))`
  return c.json({ success: true, rewardType, slotNumber, status: 'available' })
})

app.get('/api/admin/redemptions', async (c) => {
  if (!await requireAdmin(c)) return c.json({ error: 'Admin sign-in required.', code: 'ADMIN_UNAUTHENTICATED' }, 401)
  const rows = await sqlFor(c.env)`SELECT id,user_id,recipient_email,reward_type,inventory_slot_number,delivery_status,
      provider_message_id,failure_info,created_at,updated_at,delivery_attempt,
      CASE WHEN delivery_status='sending' AND updated_at < now()-interval '10 minutes' THEN 'provider_unknown' ELSE delivery_status END AS display_status
    FROM reward_redemptions ORDER BY created_at DESC LIMIT 100`
  return c.json({ redemptions: rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.recipient_email,
    rewardType: row.reward_type,
    slotNumber: row.inventory_slot_number,
    deliveryStatus: row.display_status,
    resendMessageId: row.provider_message_id,
    failureInfo: row.failure_info,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deliveryAttempt: row.delivery_attempt,
  })) })
})

app.post('/api/admin/redemptions/:redemptionId/retry', async (c) => {
  if (!await requireAdmin(c)) return c.json({ error: 'Admin sign-in required.', code: 'ADMIN_UNAUTHENTICATED' }, 401)
  if (c.env.REWARD_EMAIL_DELIVERY_ENABLED !== 'true' || !c.env.RESEND_API_KEY || !c.env.RESEND_FROM_EMAIL || !c.env.RESEND_WEBHOOK_SECRET || !c.env.REWARD_ENCRYPTION_KEY) return c.json({ error: 'Reward email delivery is disabled or incomplete.', code: 'REWARDS_DISABLED' }, 503)
  const redemptionId = c.req.param('redemptionId')
  if (!/^[0-9a-f-]{36}$/i.test(redemptionId)) return c.json({ error: 'Invalid redemption.', code: 'INVALID_REDEMPTION' }, 400)
  const [prior] = await sqlFor(c.env)`SELECT r.id,r.delivery_status FROM reward_redemptions r WHERE r.id=${redemptionId} LIMIT 1`
  if (!prior) return c.json({ error: 'Redemption not found.', code: 'REDEMPTION_NOT_FOUND' }, 404)
  if (prior.delivery_status !== 'rejected' && prior.delivery_status !== 'reserved') return c.json({ error: 'Only a confirmed rejected or not-yet-sent redemption may be retried. Reconcile ambiguous delivery first.', code: 'RETRY_NOT_SAFE' }, 409)
  const [prepared] = await prepareAdminDelivery(c, redemptionId, prior.delivery_status === 'rejected')
  if (!prepared) return c.json({ error: 'Redemption state changed; refresh before retrying.', code: 'REDEMPTION_STATE_CHANGED' }, 409)
  await sqlFor(c.env)`INSERT INTO audit_logs(action,target_type,target_id,metadata)
    VALUES('reward_email_retry','reward_redemption',${redemptionId},jsonb_build_object('attempt',${prepared.delivery_attempt}))`
  return sendReservedRedemption(c, prepared as unknown as RewardRedemption)
})

app.post('/api/admin/redemptions/:redemptionId/reconcile', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin sign-in required.', code: 'ADMIN_UNAUTHENTICATED' }, 401)
  const redemptionId = c.req.param('redemptionId')
  if (!/^[0-9a-f-]{36}$/i.test(redemptionId)) return c.json({ error: 'Invalid redemption.', code: 'INVALID_REDEMPTION' }, 400)
  const body = await c.req.json().catch(() => null) as { resolution?: unknown; messageId?: unknown } | null
  if (body?.resolution !== 'sent' && body?.resolution !== 'not_sent') return c.json({ error: 'Choose a verified delivery result.', code: 'INVALID_RECONCILIATION' }, 400)
  if (body.resolution === 'sent' && (typeof body.messageId !== 'string' || body.messageId.length < 3 || body.messageId.length > 128)) return c.json({ error: 'A Resend message ID is required when confirming delivery.', code: 'INVALID_RECONCILIATION' }, 400)
  const sent = body.resolution === 'sent'
  const [row] = await sqlFor(c.env)`WITH changed AS (
      UPDATE reward_redemptions r SET status=${sent ? 'sent' : 'failed'},delivery_status=${sent ? 'sent' : 'rejected'},
        provider_message_id=CASE WHEN ${sent} THEN ${body.messageId ?? null} ELSE r.provider_message_id END,
        failure_info=CASE WHEN ${sent} THEN NULL ELSE 'admin_confirmed_not_sent' END,delivery_updated_at=now(),updated_at=now()
      WHERE r.id=${redemptionId} AND (r.delivery_status='provider_unknown' OR (r.delivery_status='sending' AND r.updated_at < now()-interval '10 minutes'))
      RETURNING r.reward_code_id,r.status
    ), marked AS (
      UPDATE reward_codes c SET status=CASE WHEN changed.status='sent' THEN 'delivered' ELSE c.status END,
        delivered_at=CASE WHEN changed.status='sent' THEN now() ELSE c.delivered_at END
      FROM changed WHERE c.id=changed.reward_code_id RETURNING c.id
    ) SELECT id FROM marked`
  if (!row) return c.json({ error: 'Redemption is not awaiting reconciliation.', code: 'REDEMPTION_STATE_CHANGED' }, 409)
  await sqlFor(c.env)`INSERT INTO audit_logs(action,target_type,target_id,metadata)
    VALUES('reward_email_reconciled','reward_redemption',${redemptionId},jsonb_build_object('admin',${admin.username},'resolution',${body.resolution}))`
  return c.json({ success: true, status: sent ? 'sent' : 'rejected' })
})

app.post('/api/mylead/start', async (c) => {
  if (!await requireCsrf(c)) return c.json({ error: 'Session or CSRF token invalid', code: 'CSRF_DENIED' }, 403)
  return c.json({ error: 'MyLead account and signed conversion callback are not configured.', code: 'MYLEAD_DISABLED' }, 503)
})

app.post('/api/anti-cheat/report', async (c) => {
  if (!await requireCsrf(c)) return c.json({ error: 'Session or CSRF token invalid', code: 'CSRF_DENIED' }, 403)
  const body = await c.req.json().catch(() => null) as { reason?: unknown } | null
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 64).replace(/[^A-Z0-9_:-]/gi, '') : 'CLIENT_REPORT'
  await sqlFor(c.env)`INSERT INTO suspicious_runs(user_id,reason_codes) VALUES(${c.get('userId')},ARRAY[${reason || 'CLIENT_REPORT'}])`
  return c.json({ success: true })
})

app.all('*', async (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Route not found', code: 'NOT_FOUND' }, 404)
  if (new URL(c.req.url).hostname === 'admin.dashcup.com') {
    if (c.req.method !== 'GET' || (c.req.path !== '/' && c.req.path !== '/index.html')) return c.text('Not found', 404)
    const nonce = randomToken(18)
    c.header('Cache-Control', 'no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow, noarchive')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src https://api.dashcup.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`)
    return c.html(renderAdminPortal(nonce))
  }
  return c.env.ASSETS.fetch(c.req.raw)
})

app.onError((error, c) => {
  const unavailable = error.message === 'DATABASE_UNAVAILABLE'
  const sqlState = (error as Error & { code?: string }).code
  console.error(JSON.stringify({ request_id: c.req.header('cf-ray') ?? crypto.randomUUID(), route: c.req.path,
    error: unavailable ? error.message : 'INTERNAL_ERROR', ...(typeof sqlState === 'string' && /^[0-9A-Z]{5}$/.test(sqlState) ? { sql_state: sqlState } : {}) }))
  return c.json({ error: unavailable ? 'Database is not configured' : 'Request failed', code: unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR' }, unavailable ? 503 : 500)
})

export default app
