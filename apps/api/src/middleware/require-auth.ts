import type { RequestHandler } from 'express'

import { ACCESS_TOKEN_COOKIE } from '@/config/auth'
import { unauthenticated } from '@/lib/errors'
import { verifyAccessToken } from '@/lib/tokens'

/** Rejects the request with 401 unless a valid access-token cookie is present. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token: unknown = (req.cookies as Record<string, unknown> | undefined)?.[ACCESS_TOKEN_COOKIE]
  if (typeof token !== 'string' || token.length === 0) {
    throw unauthenticated()
  }
  req.auth = { userId: verifyAccessToken(token).sub }
  next()
}
