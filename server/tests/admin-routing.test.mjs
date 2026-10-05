import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isAdminPortalRequest } from '../src/admin/request-routing.ts'

test('admin HTML is served only from the explicit protected admin path', () => {
  assert.equal(isAdminPortalRequest('admin.dashcup.com', 'GET', '/admin/'), true)
  assert.equal(isAdminPortalRequest('admin.dashcup.com', 'GET', '/admin'), true)
  assert.equal(isAdminPortalRequest('admin.dashcup.com', 'GET', '/'), false)
  assert.equal(isAdminPortalRequest('game.dashcup.com', 'GET', '/admin/'), false)
  assert.equal(isAdminPortalRequest('admin.dashcup.com', 'POST', '/admin/'), false)
})

test('Worker-first routes are limited to APIs and the admin path', () => {
  const configuration = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  assert.deepEqual(configuration.assets.run_worker_first, ['/api/*', '/admin*'])
})
