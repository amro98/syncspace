import type { RequestHandler } from 'express'

import { SESSION_COOKIE } from '@/config/auth'
import { unauthenticated } from '@/lib/errors'
import { authenticateSessionToken, endSession } from '@/modules/auth/session'

/**
 * Rejects the request with 401 unless a valid, unrevoked session cookie is
 * present. A cookie that fails verification is cleared so the browser stops
 * sending it.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token: unknown = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE]
  if (typeof token !== 'string' || token.length === 0) {
    throw unauthenticated()
  }
  try {
    req.auth = await authenticateSessionToken(token)
  } catch (error) {
    endSession(res)
    throw error
  }
  next()
}
