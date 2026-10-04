import { pbkdf2Sync, randomBytes } from 'node:crypto'

const password = process.env.DASHCUP_ADMIN_PASSWORD
if (!password || password.length < 16 || password.length > 1024) {
  process.stderr.write('Set DASHCUP_ADMIN_PASSWORD to a password of at least 16 characters.\n')
  process.exit(1)
}

// Cloudflare Workers Web Crypto rejects PBKDF2 counts above 100,000.
const iterations = 100_000
const salt = randomBytes(16)
const derived = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
process.stdout.write(`pbkdf2-sha256$${iterations}$${salt.toString('base64')}$${derived.toString('base64')}\n`)
