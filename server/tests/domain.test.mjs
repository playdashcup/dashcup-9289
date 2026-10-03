import assert from 'node:assert/strict'
import test from 'node:test'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { isExpensiveMutation, isRateLimited, rateLimitKey } from '../src/security/rate-limit.ts'
import { biweeklyId, dayId, QUESTS, randomDisplayName, sanitizeClientSignals, validateEvidence, weekId } from '../src/domain.ts'
import { constantTimeStringEqual } from '../src/security/timing-safe.ts'
import { decryptRewardCode, encryptRewardCode, rewardCodeFingerprintHex } from '../src/security/reward-code.ts'
import { rewardEmailTemplate, rewardEmailVerificationTemplate } from '../src/email/reward-template.ts'
import { sendRewardEmail } from '../src/email/resend.ts'
import { verifyAdminCredentials, verifyAdminPassword } from '../src/security/admin-auth.ts'
import { renderAdminPortal } from '../src/admin/portal.ts'
import { appendSponsorSubid, detectSponsorDevice, filterSponsorOffers, isAllowedSponsorTarget, isValidSponsorPostbackId } from '../src/sponsor-offers.ts'

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

test('verifies PBKDF2 admin password hashes without accepting malformed or weak hashes', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('dashboard-test-password'), 'PBKDF2', false, ['deriveBits'])
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210_000 }, key, 256))
  const encoded = (bytes) => Buffer.from(bytes).toString('base64')
  const hash = `pbkdf2-sha256$210000$${encoded(salt)}$${encoded(bits)}`
  assert.equal(await verifyAdminPassword('dashboard-test-password', hash), true)
  assert.equal(await verifyAdminPassword('wrong-password', hash), false)
  assert.equal(await verifyAdminCredentials('dashcup-test', 'dashboard-test-password', 'dashcup-test', hash), true)
  assert.equal(await verifyAdminCredentials('intruder', 'dashboard-test-password', 'dashcup-test', hash), false)
  assert.equal(await verifyAdminPassword('dashboard-test-password', `pbkdf2-sha256$1000$${encoded(salt)}$${encoded(bits)}`), false)
  assert.equal(await verifyAdminPassword('dashboard-test-password', 'plaintext-password'), false)
})

test('admin portal has nonce CSP hooks and does not persist credentials or include inventory secrets', () => {
  const html = renderAdminPortal('unit-test-nonce')
  assert.match(html, /script nonce="unit-test-nonce"/)
  assert.match(html, /\/ 20/)
  assert.doesNotMatch(html, /localStorage|sessionStorage|RESEND_API_KEY|encrypted_code/)
  assert.match(html, /autocomplete="current-password"/)
  assert.match(html, /Confirm sent/)
  assert.match(html, /Confirm not sent/)
  assert.match(html, /\/reconcile/)
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
  assert.equal(isExpensiveMutation('POST', '/api/rewards/email/verify'), true)
  assert.equal(isExpensiveMutation('POST', '/api/admin/auth/login'), true)
  assert.equal(isExpensiveMutation('POST', '/api/sponsor/offers/start'), true)
  assert.equal(isExpensiveMutation('POST', '/webhooks/resend'), true)
  assert.equal(isExpensiveMutation('GET', '/api/rewards/status'), false)
  assert.equal(isExpensiveMutation('POST', '/api/leaderboard'), false)
})

test('publishes exactly four daily and five weekly quests with the guide values', () => {
  assert.equal(QUESTS.filter((quest) => quest.period === 'daily').length, 4)
  assert.equal(QUESTS.filter((quest) => quest.period === 'weekly').length, 4)
  assert.deepEqual(Object.fromEntries(QUESTS.map(({ type, target, reward }) => [type, [target, reward]])), {
    play_1: [10, 1_000], play_5: [80, 8_000], new_pb: [1, 1_000], sponsor_app: [1, 60_000],
    play_20: [200, 25_000], score_1000: [100, 5_000], ref_2: [2, 10_000], ppi_3: [3, 200_000],
  })
  assert.equal(QUESTS.find((quest) => quest.type === 'play_5')?.title, 'Play 80 validated games')
  assert.equal(QUESTS.find((quest) => quest.type === 'play_20')?.title, 'Play 200 validated games')
  assert.equal(QUESTS.find((quest) => quest.type === 'score_1000')?.title, 'Score 100 in ChickenDash')
  assert.equal(QUESTS.find((quest) => quest.type === 'ppi_3')?.title, 'Complete sponsor offers')
  assert.equal(QUESTS.some((quest) => quest.type === 'cpa_1'), false)
  assert.equal(QUESTS.find((quest) => quest.type === 'sponsor_app')?.description, 'Install the app for trophies.')
})

test('filters CPAlead offers by Cloudflare country, request device, and publisher campaign allowlist', () => {
  const offers = [
    { id: 5546840, title: 'iOS install', conversion: 'Install the app', device: 'ios', payout_type: 'CPI', countries: ['US'], offer_rank: 1, link: 'https://track.example/view.php?id=5546840&pub=3364343' },
    { id: 5547007, title: 'UK Android', conversion: 'Install and open', device: 'android', payout_type: 'CPA', countries: ['GB'], offer_rank: 2 },
    { id: 5543785, title: 'Germany desktop', conversion: 'Sign up', device: 'desktop', payout_type: 'CPI', countries: ['DE'], offer_rank: 3 },
    { id: 1234, title: 'Not configured', conversion: 'Install', device: 'android', payout_type: 'CPI', countries: ['US'], offer_rank: 0 },
  ]
  assert.deepEqual(filterSponsorOffers(offers, 'US', 'ios').map((offer) => offer.id), ['5546840'])
  assert.deepEqual(filterSponsorOffers(offers, 'US', 'android'), [])
  assert.deepEqual(filterSponsorOffers(offers, 'GB', 'ios'), [])
  assert.deepEqual(filterSponsorOffers(offers, 'GB', 'android').map((offer) => offer.id), ['5547007'])
  assert.deepEqual(filterSponsorOffers(offers, 'DE', 'desktop').map((offer) => offer.id), ['5543785'])
  assert.deepEqual(filterSponsorOffers(offers, 'IN', 'desktop'), [])
  assert.equal(isAllowedSponsorTarget('5546903', 'SA'), true)
  assert.equal(isAllowedSponsorTarget('5546903', 'US'), false)
})

test('detects platform hints and attaches only an opaque attribution subid to the exact feed link', () => {
  assert.equal(detectSponsorDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'ios')
  assert.equal(detectSponsorDevice('Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 Mobile'), 'android')
  assert.equal(detectSponsorDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop')
  const url = appendSponsorSubid('https://track.example/view.php?id=5546840&pub=3364343&_src=api&_src_sig=signature', '3364343', '5546840', 'd00dcafe-41aa-49c8-b966-9a6e79bf45ca')
  assert.ok(url)
  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('_src_sig'), 'signature')
  assert.equal(parsed.searchParams.get('subid'), 'd00dcafe-41aa-49c8-b966-9a6e79bf45ca')
  assert.equal(appendSponsorSubid('https://track.example/view.php?id=123&pub=3364343', '3364343', '5546840', 'id'), null)
  assert.equal(isValidSponsorPostbackId('d00dcafe-41aa-49c8-b966-9a6e79bf45ca'), true)
  assert.equal(isValidSponsorPostbackId('not-a-uuid'), false)
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

test('bounds client anti-cheat signals and ignores client-reported suspicion scores', () => {
  assert.deepEqual(sanitizeClientSignals({
    suspicionScore: 0,
    inputCount: 99,
    focusChanges: 900,
    flags: ['input_burst', 'devtools_shortcut', 'made_up_flag', 'input_burst'],
  }, 4), {
    flags: ['input_burst', 'devtools_shortcut', 'input_count_mismatch'],
    suspicionScore: 39,
    inputCount: 4,
    focusChanges: 100,
  })
  assert.deepEqual(sanitizeClientSignals({ flags: Array(100).fill('state_integrity'), focusChanges: -1 }, 0), {
    flags: ['state_integrity'],
    suspicionScore: 30,
    inputCount: 0,
    focusChanges: 0,
  })
  assert.deepEqual(sanitizeClientSignals(null, 2), { flags: [], suspicionScore: 0, inputCount: 2, focusChanges: 0 })
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
  assert.equal(template.subject, 'DASHCUP Reward — Your Robux Code')
  assert.match(rewardEmailTemplate('ONLY-CODE', 'vbucks').text, /V-Bucks/)
  assert.doesNotMatch(rewardEmailTemplate('ONLY-CODE', 'vbucks').text, /Robux|PUBG/)
})

test('reward email verification template escapes its link and does not contain reward codes', () => {
  const template = rewardEmailVerificationTemplate('https://www.dashcup.com/#verify_reward_email=secret-token')
  assert.match(template.subject, /Verify your reward email/)
  assert.match(template.html, /https:\/\/www\.dashcup\.com/)
  assert.doesNotMatch(template.html, /Robux|V-Bucks|PUBG UC|Free Fire Diamonds|Call of Duty Points/)
  assert.match(template.text, /secret-token/)
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
