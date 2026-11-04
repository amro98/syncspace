import type { RequestHandler } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'

import { env } from '@/config/env'
import { rateLimited } from '@/lib/errors'

const FIFTEEN_MINUTES = 15 * 60 * 1000

/** Production limits per client IP per 15 minutes. Development gets 10× headroom. */
export const AUTH_RATE_LIMITS = {
  /** Counts FAILED attempts only, so a successful login never locks anyone out. */
  login: 10,
  register: 10,
  forgotPassword: 5,
  resetPassword: 10,
  oauth: 30,
} as const

export type AuthRateLimitName = keyof typeof AUTH_RATE_LIMITS

const passThrough: RequestHandler = (_req, _res, next) => {
  next()
}

/**
 * Focused limiters for the auth endpoints only (the app is not rate limited
 * globally). Each call creates fresh in-memory counters; a multi-instance
 * deployment would swap in a shared store (e.g. Redis).
 */
export interface AuthRateLimitOptions {
  enabled: boolean
  /** Scales every limit. Defaults to 1 in production and 10 elsewhere. */
  multiplier?: number
}

export function createAuthRateLimiters({
  enabled,
  multiplier = env.isProduction ? 1 : 10,
}: AuthRateLimitOptions): Record<AuthRateLimitName, RequestHandler> {
  const make = (name: AuthRateLimitName): RequestHandler =>
    enabled
      ? rateLimit({
          windowMs: FIFTEEN_MINUTES,
          limit: AUTH_RATE_LIMITS[name] * multiplier,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
          skipSuccessfulRequests: name === 'login',
          handler: (_req, _res, next) => {
            next(rateLimited())
          },
        })
      : passThrough

  return {
    login: make('login'),
    register: make('register'),
    forgotPassword: make('forgotPassword'),
    resetPassword: make('resetPassword'),
    oauth: make('oauth'),
  }
}

/** Uploads per signed-in user per 15 minutes (production). Development gets 10× headroom. */
export const UPLOAD_RATE_LIMIT = 100

/**
 * Limits multipart (file) requests per user, so storage cannot be flooded.
 * Plain JSON requests on the same routes (text messages) are not counted.
 */
export function createUploadRateLimiter({
  enabled,
  multiplier = env.isProduction ? 1 : 10,
}: AuthRateLimitOptions): RequestHandler {
  if (!enabled) return passThrough
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: UPLOAD_RATE_LIMIT * multiplier,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => !req.is('multipart/form-data'),
    keyGenerator: (req) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? ''),
    handler: (_req, _res, next) => {
      next(rateLimited('Too many uploads. Please wait a few minutes and try again.'))
    },
  })
}
