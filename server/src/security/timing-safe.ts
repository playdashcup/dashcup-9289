/**
 * Compare fixed-size digests and signatures without short-circuiting on the
 * first differing character. Inputs used for secrets are digests/signatures;
 * callers should validate their format before comparing them.
 */
export function constantTimeStringEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}
