import jwt from 'jsonwebtoken'
import { z } from 'zod'

import { ACCESS_TOKEN_TTL_SECONDS } from '@/config/auth'
import { env } from '@/config/env'
import { AppError } from '@/lib/errors'

const ALGORITHM = 'HS256'

const accessTokenClaimsSchema = z.object({
  sub: z.string().min(1),
})

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>

export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: ALGORITHM,
  })
}

/** Verifies an access token. Throws an UNAUTHENTICATED AppError on any failure. */
export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] })
    return accessTokenClaimsSchema.parse(decoded)
  } catch (error) {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired session', { cause: error })
  }
}
