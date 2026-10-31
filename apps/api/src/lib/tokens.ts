import jwt from 'jsonwebtoken'
import { z } from 'zod'

import { env } from '@/config/env'
import { AppError } from '@/lib/errors'

const ALGORITHM = 'HS256'
const ISSUER = 'syncspace-api'

/**
 * Every signed token carries an audience naming its purpose, so a token minted
 * for one purpose (e.g. an OAuth state cookie) can never be accepted as
 * another (e.g. a session).
 */
type TokenPurpose = 'session' | 'oauth-state' | 'oauth-pending'

function sign(purpose: TokenPurpose, payload: object, ttlSeconds: number, subject?: string) {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: purpose,
    expiresIn: ttlSeconds,
    ...(subject && { subject }),
  })
}

/** Returns the parsed payload, or null for anything invalid, expired or of another purpose. */
function verify<TSchema extends z.ZodType>(
  purpose: TokenPurpose,
  token: string,
  schema: TSchema,
): z.output<TSchema> | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: purpose,
    })
    const parsed = schema.safeParse(decoded)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

const sessionClaimsSchema = z.object({
  /** User id. */
  sub: z.uuid(),
  /** User.tokenVersion at sign-in; a mismatch means the session was revoked. */
  ver: z.number().int().nonnegative(),
})

export type SessionClaims = z.infer<typeof sessionClaimsSchema>

export function signSessionToken(
  user: { id: string; tokenVersion: number },
  ttlSeconds: number,
): string {
  return sign('session', { ver: user.tokenVersion }, ttlSeconds, user.id)
}

/** Verifies signature/expiry only. Callers must still check `ver` against the database. */
export function verifySessionToken(token: string): SessionClaims {
  const claims = verify('session', token, sessionClaimsSchema)
  if (!claims) throw new AppError('UNAUTHENTICATED', 'Invalid or expired session')
  return claims
}

// ---------------------------------------------------------------------------
// Short-lived signed payloads (OAuth cookies)
// ---------------------------------------------------------------------------

export function signPayload(
  purpose: Exclude<TokenPurpose, 'session'>,
  payload: object,
  ttlSeconds: number,
): string {
  return sign(purpose, payload, ttlSeconds)
}

export function verifyPayload<TSchema extends z.ZodType>(
  purpose: Exclude<TokenPurpose, 'session'>,
  token: string | undefined,
  schema: TSchema,
): z.output<TSchema> | null {
  return token ? verify(purpose, token, schema) : null
}
