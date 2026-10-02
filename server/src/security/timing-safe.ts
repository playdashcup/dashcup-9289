type TimingSafeComparator = (left: Uint8Array, right: Uint8Array) => boolean

function workerTimingSafeEqual(left: Uint8Array, right: Uint8Array) {
  // Cloudflare Workers exposes this Web Crypto extension; the published DOM
  // TypeScript library does not yet include it in its SubtleCrypto interface.
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean
  }
  return subtle.timingSafeEqual(left, right)
}

/** Hash both strings to equal-size digests before using Workers' timing-safe primitive. */
export async function constantTimeStringEqual(
  left: string,
  right: string,
  compare: TimingSafeComparator = workerTimingSafeEqual,
) {
  const encoder = new TextEncoder()
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  return compare(new Uint8Array(leftDigest), new Uint8Array(rightDigest))
}
