import type { CookieOptions, Response } from 'express'

import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/config/auth'
import { env } from '@/config/env'
import { unauthenticated } from '@/lib/errors'
import { getPrisma } from '@/lib/prisma'
import { signSessionToken, verifySessionToken } from '@/lib/tokens'

/**
 * Cookie attributes shared by every auth cookie. Development runs over plain
 * HTTP on localhost (Secure off); production is HTTPS-only (Secure on).
 */
export function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/',
    ...(env.COOKIE_DOMAIN && { domain: env.COOKIE_DOMAIN }),
  }
}

/**
 * Issues the session cookie. "Remember me" off = browser-session cookie whose
 * JWT expires after 12 h; on = persistent 30-day cookie and JWT.
 */
export function startSession(
  res: Response,
  user: { id: string; tokenVersion: number },
  rememberMe: boolean,
): void {
  const ttlSeconds = rememberMe ? SESSION_TTL_SECONDS.remembered : SESSION_TTL_SECONDS.standard
  res.cookie(SESSION_COOKIE, signSessionToken(user, ttlSeconds), {
    ...baseCookieOptions(),
    ...(rememberMe && { maxAge: ttlSeconds * 1000 }),
  })
}

/** Clears the session cookie with the same attributes it was set with (required by browsers). */
export function endSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, baseCookieOptions())
}

/**
 * Resolves a session token to a user id. Besides signature and expiry, the
 * token's version must match User.tokenVersion, so a password reset (which
 * increments it) revokes every existing session immediately.
 */
export async function authenticateSessionToken(token: string): Promise<{ userId: string }> {
  const claims = verifySessionToken(token)
  const user = await getPrisma().user.findUnique({
    where: { id: claims.sub },
    select: { tokenVersion: true },
  })
  if (user?.tokenVersion !== claims.ver) {
    throw unauthenticated('Your session has ended. Please sign in again.')
  }
  return { userId: claims.sub }
}
