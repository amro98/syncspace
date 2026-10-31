import {
  type AuthProvidersResponse,
  type AuthSessionResponse,
  forgotPasswordInputSchema,
  loginInputSchema,
  type MessageResponse,
  registerInputSchema,
  resetPasswordInputSchema,
  verifyResetTokenInputSchema,
} from '@syncspace/shared'
import { type RequestHandler, Router } from 'express'

import { logger } from '@/lib/logger'
import type { AuthRateLimitName } from '@/middleware/rate-limit'
import { requireAuth } from '@/middleware/require-auth'
import { validate } from '@/middleware/validate'

import { toAuthUser } from './auth-user'
import {
  findUsableResetToken,
  getAuthUser,
  loginWithPassword,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from './auth.service'
import { createOAuthRouter } from './oauth/oauth.router'
import { enabledProviders } from './oauth/providers'
import { endSession, startSession } from './session'

const FORGOT_PASSWORD_RESPONSE: MessageResponse = {
  message: 'If an account exists for that email, we sent a link to reset the password.',
}

export function createAuthRouter(limiters: Record<AuthRateLimitName, RequestHandler>): Router {
  const router = Router()

  router.post(
    '/register',
    limiters.register,
    validate({ body: registerInputSchema }),
    async (req, res) => {
      const user = await registerUser(req.body)
      startSession(res, user, req.body.rememberMe)
      const body: AuthSessionResponse = { user: toAuthUser(user) }
      res.status(201).json(body)
    },
  )

  router.post('/login', limiters.login, validate({ body: loginInputSchema }), async (req, res) => {
    const user = await loginWithPassword(req.body)
    startSession(res, user, req.body.rememberMe)
    const body: AuthSessionResponse = { user: toAuthUser(user) }
    res.json(body)
  })

  /** Idempotent; works without a valid session so a stale cookie can always be cleared. */
  router.post('/logout', (_req, res) => {
    endSession(res)
    res.status(204).end()
  })

  router.get('/me', requireAuth, async (req, res) => {
    const user = await getAuthUser(req.auth?.userId ?? '')
    const body: AuthSessionResponse = { user: toAuthUser(user) }
    res.json(body)
  })

  router.get('/providers', (_req, res) => {
    const body: AuthProvidersResponse = { providers: enabledProviders() }
    res.json(body)
  })

  /**
   * Always answers the same, immediately: the lookup, token creation and email
   * happen in the background so neither the body nor the timing reveals
   * whether the email has an account.
   */
  router.post(
    '/forgot-password',
    limiters.forgotPassword,
    validate({ body: forgotPasswordInputSchema }),
    (req, res) => {
      requestPasswordReset(req.body.email).catch((error: unknown) => {
        logger.error({ err: error }, 'Password reset request failed')
      })
      res.status(202).json(FORGOT_PASSWORD_RESPONSE)
    },
  )

  /** Lets the reset page show "expired"/"used" before the user types a new password. */
  router.post(
    '/reset-password/verify',
    limiters.resetPassword,
    validate({ body: verifyResetTokenInputSchema }),
    async (req, res) => {
      await findUsableResetToken(req.body.token)
      const body: MessageResponse = { message: 'Reset link is valid.' }
      res.json(body)
    },
  )

  router.post(
    '/reset-password',
    limiters.resetPassword,
    validate({ body: resetPasswordInputSchema }),
    async (req, res) => {
      await resetPassword(req.body)
      // Every session (including any in this browser) was revoked; sign in again.
      endSession(res)
      const body: MessageResponse = {
        message: 'Your password has been updated. Sign in with your new password.',
      }
      res.json(body)
    },
  )

  router.use('/oauth', createOAuthRouter(limiters.oauth))

  return router
}
