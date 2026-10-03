export const MAX_INPUTS = 2_000
export const MAX_RUN_MS = 180_000
export const MIN_RUN_MS = 200
export const MAX_SCORE_PER_SECOND = 12
export const MAX_INPUTS_PER_SECOND = 16
const DISPLAY_ADJECTIVES = ['Agile', 'Amber', 'Bright', 'Cosmic', 'Daring', 'Golden', 'Jolly', 'Lucky', 'Merry', 'Mighty', 'Nimble', 'Rapid', 'Silver', 'Snappy', 'Sunny', 'Swift', 'Turbo', 'Velvet', 'Witty', 'Zesty'] as const
const DISPLAY_NOUNS = ['Badger', 'Bunny', 'Comet', 'Falcon', 'Fox', 'Gecko', 'Hawk', 'Koala', 'Otter', 'Panda', 'Penguin', 'Phoenix', 'Pigeon', 'Puma', 'Robin', 'Sparrow', 'Tiger', 'Turtle', 'Walrus', 'Wombat'] as const
const CYCLE_ANCHOR = Date.parse('2026-01-05T00:00:00.000Z')
const CYCLE_MS = 14 * 24 * 60 * 60 * 1_000

export const QUESTS = [
  { period: 'daily', type: 'play_1', target: 10, reward: 100, title: 'Play 10 validated matches', description: 'Finish 10 games that pass session and evidence checks today.' },
  { period: 'daily', type: 'play_5', target: 50, reward: 500, title: 'Play 50 validated games', description: 'Finish 50 games that pass session and evidence checks today.' },
  { period: 'daily', type: 'new_pb', target: 1, reward: 1_000, title: 'Set a new personal best', description: 'Beat your personal best today.' },
  { period: 'daily', type: 'sponsor_app', target: 1, reward: 20_000, title: 'Complete a sponsor offer', description: 'Complete one verified sponsor, CPI, or PPI event.' },
  { period: 'weekly', type: 'play_20', target: 20, reward: 2_500, title: 'Play twenty validated games', description: 'Finish twenty games that pass session and evidence checks this week.' },
  { period: 'weekly', type: 'score_1000', target: 1_000, reward: 5_000, title: 'Score 1,000 in ChickenDash', description: 'Reach a validated score of 1,000 in one ChickenDash run this week.' },
  { period: 'weekly', type: 'ref_2', target: 2, reward: 3_000, title: 'Invite two players', description: 'Two invited players must each finish a verified game.' },
  { period: 'weekly', type: 'ppi_3', target: 3, reward: 30_000, title: 'Complete sponsor offers', description: 'Complete three verified PPI conversions.' },
  { period: 'weekly', type: 'cpa_1', target: 1, reward: 80_000, title: 'Complete a CPA offer', description: 'Complete one verified CPA conversion.' },
] as const

export function randomDisplayName() {
  const values = crypto.getRandomValues(new Uint32Array(2))
  return `${DISPLAY_ADJECTIVES[values[0] % DISPLAY_ADJECTIVES.length]} ${DISPLAY_NOUNS[values[1] % DISPLAY_NOUNS.length]}`
}

export function dayId(now: Date) { return now.toISOString().slice(0, 10) }
export function weekId(now: Date) {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const weekday = (monday.getUTCDay() + 6) % 7
  monday.setUTCDate(monday.getUTCDate() - weekday)
  return monday.toISOString().slice(0, 10)
}
export function biweeklyId(now: Date) {
  const index = Math.floor((now.getTime() - CYCLE_ANCHOR) / CYCLE_MS)
  return new Date(CYCLE_ANCHOR + index * CYCLE_MS).toISOString().slice(0, 10)
}

export function validateEvidence(value: { clientScore?: unknown; durationMs?: unknown; inputs?: unknown }) {
  const { clientScore, durationMs, inputs } = value
  if (!Number.isSafeInteger(clientScore) || Number(clientScore) < 0) return 'INVALID_SCORE'
  if (!Number.isInteger(durationMs) || Number(durationMs) < MIN_RUN_MS || Number(durationMs) > MAX_RUN_MS) return 'INVALID_DURATION'
  if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS) return 'INVALID_INPUT_COUNT'
  let previousAt = -1
  let densityStart = 0
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index]
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 'INVALID_INPUT'
    const event = input as Record<string, unknown>
    if (Object.keys(event).some((key) => !['type', 'key', 'at'].includes(key))) return 'INVALID_INPUT'
    if (event.type !== 'move' || !['SWIPE_UP', 'SWIPE_DOWN', 'SWIPE_LEFT', 'SWIPE_RIGHT'].includes(String(event.key))) return 'INVALID_INPUT'
    if (!Number.isInteger(event.at) || Number(event.at) < 0 || Number(event.at) > Number(durationMs) || (previousAt >= 0 && Number(event.at) - previousAt < 50)) return 'INVALID_INPUT_SEQUENCE'
    if (index === 0 && (event.key !== 'SWIPE_UP' || Number(event.at) > 5_000)) return 'INVALID_INITIAL_MOVE'
    while (densityStart < index && Number(event.at) - Number((inputs[densityStart] as Record<string, unknown>).at) >= 1_000) densityStart += 1
    if (index - densityStart + 1 > MAX_INPUTS_PER_SECOND) return 'IMPOSSIBLE_INPUT_DENSITY'
    previousAt = Number(event.at)
  }
  // In the actual engine, each SWIPE_UP can advance score by at most one;
  // side/down moves and moving entities never increment the row score.
  const forwardMoves = inputs.reduce((count, input) => count + ((input as Record<string, unknown>).key === 'SWIPE_UP' ? 1 : 0), 0)
  // Starting an Expo run emits the engine's initial forward move. A run with
  // no forward input cannot represent a started ChickenDash game.
  if (forwardMoves === 0) return 'NO_FORWARD_INPUT'
  if (Number(clientScore) > forwardMoves) return 'SCORE_EXCEEDS_FORWARD_INPUTS'
  if (Number(clientScore) * 1_000 > Number(durationMs) * MAX_SCORE_PER_SECOND) return 'IMPOSSIBLE_SCORE_VELOCITY'
  return null
}
