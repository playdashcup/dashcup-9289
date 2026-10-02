export type RewardType = 'robux' | 'freefire' | 'vbucks' | 'pubg' | 'cod'

export interface EncryptedRewardCode {
  encryptedCode: Uint8Array
  iv: Uint8Array
  authenticationTag: Uint8Array
  fingerprint: Uint8Array
}

function decodeHex(hex: string) {
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error('REWARD_ENCRYPTION_KEY_INVALID')
  return Uint8Array.from({ length: 32 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16))
}

function encodeHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function importKey(keyHex: string, usage: KeyUsage[]) {
  return crypto.subtle.importKey('raw', decodeHex(keyHex), 'AES-GCM', false, usage)
}

export async function encryptRewardCode(plaintext: string, rewardType: RewardType, keyHex: string): Promise<EncryptedRewardCode> {
  const code = plaintext.trim()
  if (!code || code.length > 256) throw new Error('REWARD_CODE_INVALID')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aad = new TextEncoder().encode(`dashcup-reward:${rewardType}`)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, await importKey(keyHex, ['encrypt']), new TextEncoder().encode(code)))
  const ciphertext = encrypted.slice(0, -16)
  const authenticationTag = encrypted.slice(-16)
  const fingerprint = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.toUpperCase())))
  return { encryptedCode: ciphertext, iv, authenticationTag, fingerprint }
}

export async function decryptRewardCode(record: Pick<EncryptedRewardCode, 'encryptedCode' | 'iv' | 'authenticationTag'>, rewardType: RewardType, keyHex: string) {
  if (record.iv.byteLength !== 12 || record.authenticationTag.byteLength !== 16) throw new Error('REWARD_RECORD_INVALID')
  const iv = new Uint8Array(12)
  iv.set(record.iv)
  const ciphertextAndTag = new Uint8Array(record.encryptedCode.byteLength + record.authenticationTag.byteLength)
  ciphertextAndTag.set(record.encryptedCode)
  ciphertextAndTag.set(record.authenticationTag, record.encryptedCode.byteLength)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`dashcup-reward:${rewardType}`), tagLength: 128 }, await importKey(keyHex, ['decrypt']), ciphertextAndTag)
  return new TextDecoder().decode(plaintext)
}

export async function rewardCodeFingerprintHex(plaintext: string) {
  return encodeHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintext.trim().toUpperCase()))))
}
