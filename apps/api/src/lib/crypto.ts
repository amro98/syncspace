import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 256-bit random, URL-safe token (password reset, invitations, OAuth state). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Hex SHA-256. Emailed tokens are stored only as this hash. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** PKCE (RFC 7636) S256 pair. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(32)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/** Constant-time string comparison (false for different lengths). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
