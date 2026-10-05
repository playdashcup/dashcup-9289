import assert from 'node:assert/strict'
import test from 'node:test'
import { createSponsorAttributionToken, verifySponsorAttributionToken } from '../src/sponsor-attribution.ts'
import { isAllowedSponsorAttribution } from '../src/sponsor-offers.ts'

const key = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const attribution = {
  userId: '11111111-2222-4333-8444-555555555555',
  country: 'US',
  device: 'ios',
  campaigns: { '5546840': 'cpi', '5547025': 'cpa' },
}

test('sponsor attribution tokens conceal the user UUID and verify their signed claims', async () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z')
  const token = await createSponsorAttributionToken(attribution, key, now)
  assert.ok(token)
  assert.ok(token.length < 400)
  assert.equal(token.includes(attribution.userId), false)
  assert.deepEqual(await verifySponsorAttributionToken(token, key, now), attribution)
})

test('sponsor attribution rejects tampering, a different key, malformed claims, and expired tokens', async () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z')
  const token = await createSponsorAttributionToken(attribution, key, now)
  assert.ok(token)
  const body = token.slice(3)
  const replacement = body[0] === 'A' ? 'B' : 'A'
  assert.equal(await verifySponsorAttributionToken(`v1.${replacement}${body.slice(1)}`, key, now), null)
  assert.equal(await verifySponsorAttributionToken(token, 'f'.repeat(64), now), null)
  assert.equal(await verifySponsorAttributionToken(token, key, now + 30 * 24 * 60 * 60 * 1_000), null)
  assert.equal(await createSponsorAttributionToken({ ...attribution, country: 'USA' }, key, now), null)
  assert.equal(await createSponsorAttributionToken({ ...attribution, campaigns: { 'not-a-campaign': 'cpi' } }, key, now), null)
  assert.equal(await createSponsorAttributionToken(attribution, 'short', now), null)
})

test('attribution only authorizes campaigns, country, and device included in the encrypted claims', async () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z')
  const token = await createSponsorAttributionToken(attribution, key, now)
  assert.ok(token)
  const verified = await verifySponsorAttributionToken(token, key, now)
  assert.ok(verified)
  assert.equal(verified.campaigns['5546840'], 'cpi')
  assert.equal(isAllowedSponsorAttribution('5546840', 'US', verified.device), true)
  assert.equal(verified.campaigns['5546990'], undefined)
  assert.equal(isAllowedSponsorAttribution('5546840', 'GB', verified.device), false)
  assert.equal(isAllowedSponsorAttribution('5546840', 'US', 'android'), false)
})
