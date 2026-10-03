import assert from 'node:assert/strict'
import test from 'node:test'
import { getLeaderboardRowPresentation, getOutsideTop100Player } from '../../lib/leaderboard.ts'

test('top 20 use crown presentation while rank 21 and later keep their number', () => {
  assert.equal(getLeaderboardRowPresentation({ rank: 20, name: 'Swift Fox', trophies: 100 }, true).showTop20Crown, true)
  assert.equal(getLeaderboardRowPresentation({ rank: 21, name: 'Swift Fox', trophies: 100 }, true).showTop20Crown, false)
  assert.equal(getLeaderboardRowPresentation({ rank: 21, name: 'Swift Fox', trophies: 100 }, true).highlightAsCurrent, false)
})

test('current players at ranks 42, 99 and 100 are highlighted in place', () => {
  for (const rank of [42, 99, 100]) {
    assert.deepEqual(getLeaderboardRowPresentation({ rank, name: 'Swift Fox', trophies: 100, isCurrent: true }, true), {
      showTop20Crown: false,
      highlightAsCurrent: true,
    })
    assert.equal(getOutsideTop100Player({ rank, name: 'Swift Fox', trophies: 100 }), null)
  }
})

test('players ranked 101 or 500 get a single outside-top-100 footer row label', () => {
  for (const rank of [101, 500]) {
    const player = { rank, name: 'Swift Fox', trophies: 100 }
    assert.equal(getLeaderboardRowPresentation({ ...player, isCurrent: true }, true).highlightAsCurrent, false)
    assert.deepEqual(getOutsideTop100Player(player), { ...player, rankLabel: '>100' })
  }
  assert.equal(getOutsideTop100Player(null), null)
  assert.equal(getOutsideTop100Player(undefined), null)
})
