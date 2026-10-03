import { neon } from '@neondatabase/serverless'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getCookie, setCookie } from 'hono/cookie'
import { decryptRewardCode, encryptRewardCode, type RewardType } from './security/reward-code'
import { constantTimeStringEqual } from './security/timing-safe'
import { rewardEmailTemplate } from './email/reward-template'
import { sendRewardEmail } from './email/resend'
import { isExpensiveMutation, isRateLimited, rateLimitKey } from './security/rate-limit'
import { biweeklyId, dayId, MAX_INPUTS, MAX_RUN_MS, QUESTS, randomDisplayName, sanitizeClientSignals, validateEvidence, weekId } from './domain'

interface Env {
  DATABASE_URL?: string
  ASSETS: { fetch(request: Request): Promise<Response> }
  API_RATE_LIMIT: { limit(input: { key: string }): Promise<{ success: boolean }> }
  MUTATION_RATE_LIMIT?: { limit(input: { key: string }): Promise<{ success: boolean }> }
  ALLOWED_ORIGINS: string
  ENVIRONMENT: string
  PUBLIC_ORIGIN: string
  REWARD_ENCRYPTION_KEY?: string
  REWARD_ADMIN_TOKEN?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  REWARD_EMAIL_DELIVERY_ENABLED?: string
  GAME_REPLAY_ENABLED?: string
  RESEND_WEBHOOK_SECRET?: string
}

type Variables = { userId: string; sessionId: string; csrfHash: string }
type AppContext = Context<{ Bindings: Env; Variables: Variables }>
type RewardRedemption = { id: string; status: string; delivery_status: string; recipient_email: string; reward_type: RewardType; encrypted_code: Uint8Array; iv: Uint8Array; authentication_tag: Uint8Array }
const app = new Hono<{ Bindings: Env; Variables: Variables }>()
const SESSION_COOKIE = 'dashcup_session'
const CYCLE_MS = 14 * 24 * 60 * 60 * 1_000
const RUN_CLOCK_TOLERANCE_MS = 10_000

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
      ON CONFLICT(user_id,cycle_type,cycle_id,quest_type) DO NOTHING
      RETURNING id,user_id,cycle_type,cycle_id,quest_type,target,progress,reward,completed,claimed
    ) SELECT u.id,u.display_name,u.trophies,u.personal_best,u.referral_code,u.reward_email,u.gift_choice,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'type',q.quest_type,'period',q.cycle_type,'target',q.target,
        'progress',q.progress,'reward',q.reward,'completed',q.completed,'claimed',q.claimed)
        ORDER BY q.cycle_type,q.quest_type)
        FROM (SELECT id,user_id,cycle_type,cycle_id,quest_type,target,progress,reward,completed,claimed FROM quests
          WHERE user_id=u.id AND ((cycle_type='daily' AND cycle_id=${dailyId}) OR (cycle_type='weekly' AND cycle_id=${weeklyId}))
          UNION ALL
          SELECT id,user_id,cycle_type,cycle_id,quest_type,target,progress,reward,completed,claimed FROM seeded_quests) q),'[]'::jsonb) AS quests
    FROM users u WHERE u.id=${activeSession.user_id} AND u.disabled_at IS NULL`
  const user = snapshot
  if (!user) return c.json({ error: 'Session user unavailable', code: 'SESSION_INVALID' }, 401)
  const quests = snapshot.quests as Array<{ id: string; type: string; period: string; target: number; progress: number; reward: number; completed: boolean; claimed: boolean }>
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
    FROM top_rows`
  return c.json({
    success: true,
    csrfToken,
    me: { user: { id: user.id, displayName: user.display_name }, trophies: Number(user.trophies), personalBest: user.personal_best, referralCode: user.referral_code, rewardEmail: user.reward_email, giftChoice: user.gift_choice },
    quests: quests.map((row) => ({ id: row.id, title: QUESTS.find((item) => item.type === row.type)?.title ?? row.type, description: QUESTS.find((item) => item.type === row.type)?.description, period: row.period, target: row.target, progress: row.progress, reward: row.reward, completed: row.completed, claimed: row.claimed })),
    leaderboard: { active: leaderboardSnapshot.active, closed: leaderboardSnapshot.closed, currentPlayer: leaderboardSnapshot.current_player, cycle: activeCycle },
    eligibility: { eligible: leaderboardSnapshot.user_rank !== null, rank: leaderboardSnapshot.user_rank ?? null, cycle: closedCycle, rewardEmail: user.reward_email, giftChoice: user.gift_choice, redeemed: leaderboardSnapshot.redeemed },
    referral: { referralCode: user.referral_code, referralUrl: `${c.env.PUBLIC_ORIGIN}/?ref=${encodeURIComponent(user.referral_code)}` },
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
  const [user] = await sqlFor(c.env)`SELECT id,display_name,trophies,personal_best,referral_code,reward_email,gift_choice FROM users WHERE id=${c.get('userId')}`
  return c.json({ user: { id: user.id, displayName: user.display_name }, trophies: Number(user.trophies), personalBest: user.personal_best, referralCode: user.referral_code, rewardEmail: user.reward_email, giftChoice: user.gift_choice })
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
      RETURNING u.id,u.display_name,u.trophies,u.personal_best,u.referral_code,u.reward_email,u.gift_choice,
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
      SELECT 'weekly:'||${weeklyId}||':ref_2',referrer_id,'weekly',${weeklyId},'ref_2',2,1,false,3000 FROM qualified
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
        'personalBest',p.personal_best,'referralCode',p.referral_code,'rewardEmail',p.reward_email,'giftChoice',p.gift_choice) AS me,
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
  const progress = recorded.me as { id: string; displayName: string; trophies: number; personalBest: number | null; referralCode: string; rewardEmail: string | null; giftChoice: string | null }
  const stateQuests = recorded.quests as Array<{ id: string; type: string; period: string; target: number; progress: number; reward: number; completed: boolean; claimed: boolean }>
  return c.json({
    accepted: true,
    verification: 'plausibility_checked',
    awarded: Number(recorded.verified_score) > 0,
    score: recorded.verified_score,
    trophiesEarned: Number(recorded.verified_score),
    totalTrophies: Number(recorded.total_trophies),
    state: {
      me: { user: { id: progress.id, displayName: progress.displayName }, trophies: Number(progress.trophies), personalBest: progress.personalBest, referralCode: progress.referralCode, rewardEmail: progress.rewardEmail, giftChoice: progress.giftChoice },
      quests: stateQuests.map((row) => ({ id: row.id, title: QUESTS.find((item) => item.type === row.type)?.title ?? row.type, description: QUESTS.find((item) => item.type === row.type)?.description, period: row.period, target: row.target, progress: row.progress, reward: row.reward, completed: row.completed, claimed: row.claimed })),
    },
  })
})

app.get('/api/quests', async (c) => {
  if (!await requireSession(c)) return c.json({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401)
  const now = new Date()
  const rows = await sqlFor(c.env)`SELECT id,quest_type AS type,cycle_type AS period,target,progress,reward,completed,claimed FROM quests
    WHERE user_id=${c.get('userId')} AND ((cycle_type='daily' AND cycle_id=${dayId(now)}) OR (cycle_type='weekly' AND cycle_id=${weekId(now)})) ORDER BY cycle_type,quest_type`
  return c.json(rows.map((row) => ({ id: row.id, title: QUESTS.find((item) => item.type === row.type)?.title ?? row.type, description: QUESTS.find((item) => item.type === row.type)?.description, period: row.period, target: row.target, progress: row.progress, reward: row.reward, completed: row.completed, claimed: row.claimed })))
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
  const [result] = await sql`WITH current AS MATERIALIZED (
      SELECT id,reward_email,gift_choice,reward_email_change_count,reward_email_window_started_at
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
        updated_at=now()
      FROM current old WHERE u.id=old.id AND (old.reward_email IS NOT DISTINCT FROM ${email}
        OR old.reward_email_window_started_at IS NULL OR old.reward_email_window_started_at <= now()-interval '7 days'
        OR old.reward_email_change_count < 3)
        AND (old.reward_email IS DISTINCT FROM ${email} OR old.gift_choice IS DISTINCT FROM ${body.giftChoice})
      RETURNING u.reward_email,u.gift_choice
    ) SELECT reward_email,gift_choice FROM updated
      UNION ALL SELECT reward_email,gift_choice FROM current
        WHERE reward_email IS NOT DISTINCT FROM ${email} AND gift_choice IS NOT DISTINCT FROM ${body.giftChoice}
      LIMIT 1`
  if (!result) return c.json({ error: 'Only three reward email changes are allowed per seven days', code: 'EMAIL_CHANGE_LIMIT' }, 429)
  return c.json({ success: true, rewardEmail: result.reward_email, giftChoice: result.gift_choice })
})

app.post('/api/rewards/redeem', async (c) => {
  if (!await requireCsrf(c)) return c.json({ error: 'Session or CSRF token invalid', code: 'CSRF_DENIED' }, 403)
  if (c.env.REWARD_EMAIL_DELIVERY_ENABLED !== 'true' || !c.env.REWARD_ENCRYPTION_KEY || !c.env.RESEND_API_KEY || !c.env.RESEND_FROM_EMAIL) return c.json({ error: 'Reward delivery is not enabled for this environment.', code: 'REWARDS_DISABLED' }, 503)
  const body = await c.req.json().catch(() => null) as { giftChoice?: unknown } | null
  const choices = new Set<RewardType>(['robux', 'freefire', 'vbucks', 'pubg', 'cod'])
  if (typeof body?.giftChoice !== 'string' || !choices.has(body.giftChoice as RewardType)) return c.json({ error: 'Choose a valid reward category.', code: 'INVALID_REWARD_DETAILS' }, 400)
  const rewardType = body.giftChoice as RewardType
  const now = new Date()
  const activeCycle = biweeklyId(now)
  const closedCycle = new Date(Date.parse(`${activeCycle}T00:00:00Z`) - CYCLE_MS).toISOString().slice(0, 10)
  const sql = sqlFor(c.env)
  const [prior] = await sql`SELECT r.id,r.status,r.delivery_status,r.recipient_email,r.reward_type,c.encrypted_code,c.iv,c.authentication_tag
    FROM reward_redemptions r JOIN reward_codes c ON c.id=r.reward_code_id
    WHERE r.user_id=${c.get('userId')} AND r.cycle_id=${closedCycle} LIMIT 1`
  let redemption = prior as unknown as RewardRedemption | undefined
  if (redemption && redemption.status === 'sent') return c.json({ success: true, status: 'sent' })
  if (redemption && redemption.status === 'cancelled') return c.json({ error: 'This reward redemption has been cancelled.', code: 'REDEMPTION_CANCELLED' }, 409)
  if (redemption && redemption.delivery_status === 'accepted') return c.json({ success: true, status: 'accepted' }, 202)
  if (redemption && redemption.delivery_status === 'provider_unknown') return c.json({ error: 'Provider delivery is ambiguous and needs reconciliation.', code: 'PROVIDER_UNKNOWN', status: 'provider_unknown' }, 202)
  if (redemption && redemption.delivery_status === 'rejected') return c.json({ error: 'The provider rejected delivery; contact support.', code: 'DELIVERY_REJECTED', status: 'rejected' }, 502)
  if (!redemption) {
    const redemptionId = crypto.randomUUID()
    const [created] = await sql`WITH locked_user AS MATERIALIZED (
        SELECT id,reward_email,gift_choice FROM users WHERE id=${c.get('userId')} AND disabled_at IS NULL AND reward_email IS NOT NULL FOR UPDATE
      ), eligible AS MATERIALIZED (
        SELECT cs.user_id FROM cycle_scores cs JOIN locked_user u ON u.id=cs.user_id WHERE cs.cycle_id=${closedCycle}
        AND u.gift_choice=${rewardType} AND (SELECT count(*) FROM cycle_scores top WHERE top.cycle_id=${closedCycle}
          AND (top.trophies>cs.trophies OR (top.trophies=cs.trophies AND top.user_id<=cs.user_id))) <= 20
      ), picked AS MATERIALIZED (
        SELECT c.id FROM reward_codes c WHERE c.reward_type=${rewardType} AND c.status='available'
        AND (SELECT count(*) FROM reward_codes stock WHERE stock.reward_type=${rewardType} AND stock.status='available') > 20
        ORDER BY c.created_at,c.id FOR UPDATE SKIP LOCKED LIMIT 1
      ), reserved AS (
        UPDATE reward_codes c SET status='reserved',reserved_at=now() FROM picked p WHERE c.id=p.id RETURNING c.id
      ), inserted AS (
        INSERT INTO reward_redemptions(id,user_id,cycle_id,reward_type,reward_code_id,recipient_email,status,idempotency_key)
        SELECT ${redemptionId},u.id,${closedCycle},${rewardType},r.id,u.reward_email,'sending',${redemptionId}
        FROM locked_user u JOIN eligible e ON e.user_id=u.id CROSS JOIN reserved r
        ON CONFLICT DO NOTHING RETURNING id,reward_code_id
      ) SELECT r.id,r.status,r.recipient_email,r.reward_type,c.encrypted_code,c.iv,c.authentication_tag
        FROM inserted i JOIN reward_redemptions r ON r.id=i.id JOIN reward_codes c ON c.id=i.reward_code_id`
    redemption = created as unknown as RewardRedemption | undefined
  }
  if (!redemption) return c.json({ error: 'This account is not eligible or reward stock is below the safety threshold.', code: 'REWARD_UNAVAILABLE' }, 409)
  if (redemption.reward_type !== rewardType) return c.json({ error: 'The selected reward does not match the saved reward choice.', code: 'REWARD_CHOICE_MISMATCH' }, 409)
  const code = await decryptRewardCode({ encryptedCode: redemption.encrypted_code, iv: redemption.iv, authenticationTag: redemption.authentication_tag }, redemption.reward_type, c.env.REWARD_ENCRYPTION_KEY)
  const message = rewardEmailTemplate(code, redemption.reward_type)
  const outcome = await sendRewardEmail({ apiKey: c.env.RESEND_API_KEY, from: c.env.RESEND_FROM_EMAIL, to: redemption.recipient_email, ...message, idempotencyKey: redemption.id })
  if (outcome.state === 'accepted') {
    await sql`UPDATE reward_redemptions SET status='sending',delivery_status='accepted',delivery_updated_at=now(),provider_message_id=${outcome.messageId},failure_info=NULL,updated_at=now() WHERE id=${redemption.id}`
    return c.json({ success: true, status: 'accepted' })
  }
  if (outcome.state === 'rejected') {
    await sql`UPDATE reward_redemptions SET status='failed',delivery_status='rejected',delivery_updated_at=now(),failure_info=${outcome.reason},updated_at=now() WHERE id=${redemption.id}`
    return c.json({ error: 'The mail provider rejected delivery. Contact support before retrying.', code: 'DELIVERY_REJECTED', status: 'rejected' }, 502)
  }
  await sql`UPDATE reward_redemptions SET status='provider_unknown',delivery_status='provider_unknown',delivery_updated_at=now(),failure_info=${outcome.reason},updated_at=now() WHERE id=${redemption.id}`
  return c.json({ error: 'Delivery status is not yet known and needs reconciliation.', code: 'PROVIDER_UNKNOWN', status: 'provider_unknown' }, 202)
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

app.post('/api/admin/rewards/import', async (c) => {
  const adminToken = c.env.REWARD_ADMIN_TOKEN
  const supplied = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!adminToken || !supplied) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  const expectedHash = await sha256(adminToken)
  const suppliedHash = await sha256(supplied)
  if (!await constantTimeStringEqual(expectedHash, suppliedHash)) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  if (!c.env.REWARD_ENCRYPTION_KEY) return c.json({ error: 'Reward encryption is not configured.', code: 'REWARD_CONFIG_MISSING' }, 503)
  const body = await c.req.json().catch(() => null) as { rewardType?: unknown; codes?: unknown } | null
  const choices = new Set<RewardType>(['robux', 'freefire', 'vbucks', 'pubg', 'cod'])
  if (typeof body?.rewardType !== 'string' || !choices.has(body.rewardType as RewardType) || !Array.isArray(body.codes) || body.codes.length < 1 || body.codes.length > 250 || body.codes.some((code) => typeof code !== 'string' || !code.trim() || code.length > 256)) return c.json({ error: 'Invalid import payload.', code: 'INVALID_IMPORT' }, 400)
  const rewardType = body.rewardType as RewardType
  let imported = 0
  for (const raw of body.codes as string[]) {
    const encrypted = await encryptRewardCode(raw, rewardType, c.env.REWARD_ENCRYPTION_KEY)
    const [row] = await sqlFor(c.env)`INSERT INTO reward_codes(reward_type,encrypted_code,iv,authentication_tag,fingerprint)
      VALUES(${rewardType},${encrypted.encryptedCode},${encrypted.iv},${encrypted.authenticationTag},${encrypted.fingerprint})
      ON CONFLICT(fingerprint) DO NOTHING RETURNING id`
    if (row) imported += 1
  }
  return c.json({ success: true, imported, duplicates: body.codes.length - imported })
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
