const MIN_ITERATIONS = 210_000
const MAX_ITERATIONS = 1_000_000

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function decodeBase64(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('ADMIN_HASH_INVALID')
  const decoded = atob(value)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

function constantTimeHexEqual(left: string, right: string) {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

/** Format: pbkdf2-sha256$iterations$base64-salt$base64-derived-key. */
export async function verifyAdminPassword(password: string, encodedHash: string) {
  const [algorithm, iterationText, saltText, expectedText, extra] = encodedHash.split('$')
  const iterations = Number(iterationText)
  if (algorithm !== 'pbkdf2-sha256' || extra !== undefined || !Number.isInteger(iterations)
    || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return false

  let salt: Uint8Array
  let expected: Uint8Array
  try {
    salt = decodeBase64(saltText)
    expected = decodeBase64(expectedText)
  } catch {
    return false
  }
  if (salt.byteLength < 16 || salt.byteLength > 64 || expected.byteLength !== 32 || password.length < 1 || password.length > 1024) return false

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations }, key, 256))
  return constantTimeHexEqual(bytesToHex(derived), bytesToHex(expected))
}

export async function verifyAdminCredentials(username: string, password: string, expectedUsername: string, encodedHash: string) {
  const encoder = new TextEncoder()
  const [provided, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(username)),
    crypto.subtle.digest('SHA-256', encoder.encode(expectedUsername)),
  ])
  const usernameMatches = constantTimeHexEqual(bytesToHex(new Uint8Array(provided)), bytesToHex(new Uint8Array(expected)))
  const passwordMatches = await verifyAdminPassword(password, encodedHash)
  return usernameMatches && passwordMatches
}
