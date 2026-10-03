import assert from 'node:assert/strict'
import test from 'node:test'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { isExpensiveMutation, isRateLimited, rateLimitKey } from '../src/security/rate-limit.ts'
import { biweeklyId, dayId, QUESTS, randomDisplayName, validateEvidence, weekId } from '../src/domain.ts'
import { constantTimeStringEqual } from '../src/security/timing-safe.ts'
import { decryptRewardCode, encryptRewardCode, rewardCodeFingerprintHex } from '../src/security/reward-code.ts'
import { rewardEmailTemplate } from '../src/email/reward-template.ts'
import { sendRewardEmail } from '../src/email/resend.ts'

test('hashes both strings to fixed-size inputs before timing-safe comparison', async () => {
  const comparisons = []
  const compare = (left, right) => {
    comparisons.push([left.byteLength, right.byteLength])
    let difference = 0
    for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index]
    return difference === 0
  }

  assert.equal(await constantTimeStringEqual('secret', 'secret', compare), true)
  assert.equal(await constantTimeStringEqual('secret', 'a much longer secret', compare), false)
  assert.deepEqual(comparisons, [[32, 32], [32, 32]])
})

test('caps streamed request bodies before JSON handlers receive them', async () => {
  const app = new Hono()
  app.use('/api/*', bodyLimit({ maxSize: 7, onError: (c) => c.json({ code: 'PAYLOAD_TOO_LARGE' }, 413) }))
  app.post('/api/test', async (c) => c.json(await c.req.json()))

  const accepted = await app.request('/api/test', { method: 'POST', body: '{"a":1}' })
  assert.equal(accepted.status, 200)
  assert.deepEqual(await accepted.json(), { a: 1 })

  const rejected = await app.request('/api/test', { method: 'POST', body: '{"a":10}' })
  assert.equal(rejected.status, 413)
  assert.deepEqual(await rejected.json(), { code: 'PAYLOAD_TOO_LARGE' })
})

test('returns a 429 response when the Cloudflare rate-limit binding rejects a request', async () => {
  const observedKeys = []
  const key = rateLimitKey('198.51.100.7')
  const app = new Hono()
  app.use('/api/*', async (c, next) => {
    if (await isRateLimited(c.env.API_RATE_LIMIT, key)) {
      return c.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
    }
    await next()
  })
  app.get('/api/health', (c) => c.json({ ok: true }))

  const response = await app.request('/api/health', {
    headers: { 'CF-Connecting-IP': '198.51.100.7' },
  }, {
    API_RATE_LIMIT: {
      limit: async ({ key }) => {
        observedKeys.push(key)
        return { success: false }
      },
    },
  })

  assert.equal(response.status, 429)
  assert.deepEqual(await response.json(), { error: 'Too many requests', code: 'RATE_LIMITED' })
  assert.deepEqual(observedKeys, ['198.51.100.7'])
  assert.equal(rateLimitKey('198.51.100.7'), rateLimitKey('198.51.100.7'))
})

test('applies the stricter mutation budget only to expensive POST routes', () => {
  assert.equal(isExpensiveMutation('POST', '/api/game/start'), true)
  assert.equal(isExpensiveMutation('POST', '/api/game/end'), true)
  assert.equal(isExpensiveMutation('POST', '/api/quests/daily%3Afoo/claim'), true)
  assert.equal(isExpensiveMutation('POST', '/api/rewards/redeem'), true)
  assert.equal(isExpensiveMutation('POST', '/api/rewards/email'), true)
  assert.equal(isExpensiveMutation('POST', '/webhooks/resend'), true)
  assert.equal(isExpensiveMutation('GET', '/api/rewards/status'), false)
  assert.equal(isExpensiveMutation('POST', '/api/leaderboard'), false)
})

test('publishes exactly four daily and five weekly quests with the guide values', () => {
  assert.equal(QUESTS.filter((quest) => quest.period === 'daily').length, 4)
  assert.equal(QUESTS.filter((quest) => quest.period === 'weekly').length, 5)
  assert.deepEqual(Object.fromEntries(QUESTS.map(({ type, target, reward }) => [type, [target, reward]])), {
    play_1: [10, 100], play_5: [80, 500], new_pb: [1, 1_000], sponsor_app: [1, 40_000],
    play_20: [200, 2_500], score_1000: [1_000, 5_000], ref_2: [2, 3_000], ppi_3: [3, 150_000], cpa_1: [1, 120_000],
  })
  assert.equal(QUESTS.find((quest) => quest.type === 'play_5')?.title, 'Play 80 validated games')
  assert.equal(QUESTS.find((quest) => quest.type === 'play_20')?.title, 'Play 200 validated games')
  assert.equal(QUESTS.find((quest) => quest.type === 'score_1000')?.title, 'Score 1,000 in ChickenDash')
  assert.equal(QUESTS.find((quest) => quest.type === 'ppi_3')?.title, 'Complete sponsor offers')
})

test('generates short curated player names without exposing user-provided information', () => {
  const names = Array.from({ length: 30 }, () => randomDisplayName())
  assert.ok(names.every((name) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name) && name.length <= 24 && name !== 'Runner'))
  assert.ok(new Set(names).size > 1)
  assert.ok(names.every((name) => !name.includes('@')))
})

test('derives daily and weekly cycles in UTC', () => {
  const instant = new Date('2026-10-01T00:30:00+05:30')
  assert.equal(dayId(instant), '2026-09-30')
  assert.equal(weekId(instant), '2026-09-28')
})

test('derives 14-day cycles from the fixed guide anchor', () => {
  assert.equal(biweeklyId(new Date('2026-01-05T00:00:00Z')), '2026-01-05')
  assert.equal(biweeklyId(new Date('2026-01-18T23:59:59Z')), '2026-01-05')
  assert.equal(biweeklyId(new Date('2026-01-19T00:00:00Z')), '2026-01-19')
})

test('bounds evidence and rejects scores unsupported by the recorded forward inputs', () => {
  const valid = { clientScore: 4, durationMs: 10_000, inputs: [100, 200, 300, 400].map((at) => ({ type: 'move', key: 'SWIPE_UP', at })) }
  assert.equal(validateEvidence(valid), null)
  assert.equal(validateEvidence({ ...valid, durationMs: 180_001 }), 'INVALID_DURATION')
  assert.equal(validateEvidence({ ...valid, durationMs: 199 }), 'INVALID_DURATION')
  assert.equal(validateEvidence({ ...valid, inputs: Array(2_001).fill(valid.inputs[0]) }), 'INVALID_INPUT_COUNT')
  assert.equal(validateEvidence({ ...valid, clientScore: 5 }), 'SCORE_EXCEEDS_FORWARD_INPUTS')
  assert.equal(validateEvidence({ clientScore: 130, durationMs: 10_000, inputs: Array.from({ length: 130 }, (_, index) => ({ type: 'move', key: 'SWIPE_UP', at: index * 75 })) }), 'IMPOSSIBLE_SCORE_VELOCITY')
  assert.equal(validateEvidence({ ...valid, clientScore: Number.MAX_SAFE_INTEGER + 1 }), 'INVALID_SCORE')
  assert.equal(validateEvidence({ ...valid, inputs: [] }), 'NO_FORWARD_INPUT')
  assert.equal(validateEvidence({ ...valid, inputs: [{ type: 'move', key: 'SWIPE_LEFT', at: 100 }] }), 'INVALID_INITIAL_MOVE')
  assert.equal(validateEvidence({ ...valid, inputs: [{ type: 'move', key: 'HACK', at: 0 }] }), 'INVALID_INPUT')
  assert.equal(validateEvidence({ ...valid, inputs: [{ type: 'move', key: 'SWIPE_UP', at: -1 }] }), 'INVALID_INPUT_SEQUENCE')
  assert.equal(validateEvidence({ ...valid, inputs: [{ type: 'move', key: 'SWIPE_LEFT', at: 1 }] }), 'INVALID_INITIAL_MOVE')
  assert.equal(validateEvidence({ ...valid, inputs: [{ type: 'move', key: 'SWIPE_UP', at: 5_001 }] }), 'INVALID_INITIAL_MOVE')
  assert.equal(validateEvidence({ ...valid, inputs: [{ type: 'move', key: 'SWIPE_UP', at: 10_001 }] }), 'INVALID_INPUT_SEQUENCE')
  assert.equal(validateEvidence({ ...valid, inputs: [{ type: 'move', key: 'SWIPE_UP', at: 20 }, { type: 'move', key: 'SWIPE_DOWN', at: 69 }] }), 'INVALID_INPUT_SEQUENCE')
  assert.equal(validateEvidence({ ...valid, inputs: Array.from({ length: 17 }, (_, index) => ({ type: 'move', key: 'SWIPE_UP', at: index * 55 })) }), 'IMPOSSIBLE_INPUT_DENSITY')
})

test('encrypts reward codes with AES-256-GCM, authenticates category, and fingerprints duplicates', async () => {
  const key = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
  const encrypted = await encryptRewardCode('  SAMPLE-CODE-123  ', 'robux', key)
  assert.equal(encrypted.iv.byteLength, 12)
  assert.equal(encrypted.authenticationTag.byteLength, 16)
  assert.equal(await decryptRewardCode(encrypted, 'robux', key), 'SAMPLE-CODE-123')
  assert.equal(await rewardCodeFingerprintHex('sample-code-123'), [...encrypted.fingerprint].map((byte) => byte.toString(16).padStart(2, '0')).join(''))
  await assert.rejects(() => decryptRewardCode(encrypted, 'vbucks', key))
  const corrupted = { ...encrypted, authenticationTag: encrypted.authenticationTag.slice() }
  corrupted.authenticationTag[0] ^= 1
  await assert.rejects(() => decryptRewardCode(corrupted, 'robux', key))
})

test('reward email template escapes HTML and includes a plain-text alternative', () => {
  const template = rewardEmailTemplate('<img src=x onerror=alert(1)>', 'robux')
  assert.match(template.html, /&lt;img/)
  assert.match(template.text, /<img/)
  assert.equal(template.subject, 'Your ChickenDash robux reward')
})

test('Resend send uses the redemption idempotency key and classifies accepted delivery', async () => {
  const originalFetch = globalThis.fetch
  let observedKey = ''
  globalThis.fetch = async (_input, init) => {
    observedKey = new Headers(init?.headers).get('Idempotency-Key') ?? ''
    return new Response(JSON.stringify({ id: 'email-test-id' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const outcome = await sendRewardEmail({ apiKey: 'test-secret', from: 'rewards@example.test', to: 'user@example.test', subject: 'reward', html: '<p>x</p>', text: 'x', idempotencyKey: 'redemption-123' })
    assert.equal(observedKey, 'redemption-123')
    assert.deepEqual(outcome, { state: 'accepted', messageId: 'email-test-id' })
  } finally { globalThis.fetch = originalFetch }
})

test('Resend classifies provider rejection and network ambiguity without exposing provider response bodies', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('private provider detail', { status: 422 })
    assert.deepEqual(await sendRewardEmail({ apiKey: 'secret', from: 'a@b.test', to: 'c@d.test', subject: 's', html: 'h', text: 't', idempotencyKey: 'id' }), { state: 'rejected', reason: 'resend_http_422' })
    globalThis.fetch = async () => { throw new Error('socket reset') }
    assert.deepEqual(await sendRewardEmail({ apiKey: 'secret', from: 'a@b.test', to: 'c@d.test', subject: 's', html: 'h', text: 't', idempotencyKey: 'id' }), { state: 'provider_unknown', reason: 'network_or_provider_ambiguity' })
  } finally { globalThis.fetch = originalFetch }
})
