import {
  AUTH_PROVIDERS,
  type AuthProvider,
  type ErrorCode,
  type OAuthConfirmResponse,
  type OAuthPending,
  safeRedirectPath,
} from '@syncspace/shared'
import { type Request, type RequestHandler, type Response, Router } from 'express'
import { z } from 'zod'

import {
  OAUTH_COOKIE_PATH,
  OAUTH_PENDING_COOKIE,
  OAUTH_PENDING_TTL_SECONDS,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
} from '@/config/auth'
import { env } from '@/config/env'
import { createPkcePair, randomToken, safeEqual } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { signPayload, verifyPayload } from '@/lib/tokens'
import { toAuthUser } from '@/modules/auth/auth-user'
import { baseCookieOptions, startSession } from '@/modules/auth/session'

import {
  confirmPending,
  pendingSocialSchema,
  resolveSignIn,
  toPublicPending,
  type PendingSocial,
} from './oauth.service'
import { callbackUrl, getOAuthClient } from './providers'

const stateSchema = z.object({
  provider: z.enum(AUTH_PROVIDERS),
  state: z.string().min(1),
  verifier: z.string().min(1),
  redirect: z.string(),
  rememberMe: z.boolean(),
})

/**
 * OAuth cookies are always SameSite=Lax: the provider's redirect back to the
 * callback is a cross-site top-level GET, which Strict would strip.
 */
function oauthCookieOptions(maxAgeSeconds?: number) {
  return {
    ...baseCookieOptions(),
    sameSite: 'lax' as const,
    path: OAUTH_COOKIE_PATH,
    ...(maxAgeSeconds && { maxAge: maxAgeSeconds * 1000 }),
  }
}

function parseProvider(value: unknown): AuthProvider | null {
  const upper = typeof value === 'string' ? value.toUpperCase() : ''
  return (AUTH_PROVIDERS as readonly string[]).includes(upper) ? (upper as AuthProvider) : null
}

function redirectToApp(res: Response, path: string): void {
  res.redirect(303, `${env.FRONTEND_URL}${path}`)
}

function redirectWithError(res: Response, code: ErrorCode, redirect = '/app'): void {
  const params = new URLSearchParams({ error: code })
  if (redirect !== '/app') params.set('redirect', redirect)
  redirectToApp(res, `/login?${params.toString()}`)
}

function readPending(req: Request): PendingSocial | null {
  const cookies = req.cookies as Record<string, string | undefined>
  return verifyPayload('oauth-pending', cookies[OAUTH_PENDING_COOKIE], pendingSocialSchema)
}

function requirePending(req: Request): PendingSocial {
  const pending = readPending(req)
  if (!pending) {
    throw new AppError('OAUTH_PENDING_EXPIRED', 'This sign-in request expired. Please start again.')
  }
  return pending
}

export function createOAuthRouter(limiter: RequestHandler): Router {
  const router = Router()

  // Static routes first: they must not be captured by "/:provider".
  /** What the confirmation page shows. */
  router.get('/pending', (req, res) => {
    const body: OAuthPending = toPublicPending(requirePending(req))
    res.json(body)
  })

  /** "Create account" / "Link & continue". */
  router.post('/pending/confirm', async (req, res) => {
    const pending = requirePending(req)
    const user = await confirmPending(pending)
    res.clearCookie(OAUTH_PENDING_COOKIE, oauthCookieOptions())
    startSession(res, user, pending.rememberMe)
    const body: OAuthConfirmResponse = { user: toAuthUser(user), redirectTo: pending.redirect }
    res.json(body)
  })

  /** "Cancel": nothing was created; forget the pending state. */
  router.post('/pending/cancel', (_req, res) => {
    res.clearCookie(OAUTH_PENDING_COOKIE, oauthCookieOptions())
    res.status(204).end()
  })

  /** Starts the flow: GET /auth/oauth/:provider?redirect=/invite/…&remember=1 */
  router.get('/:provider', limiter, (req, res) => {
    const redirect = safeRedirectPath(req.query.redirect)
    const provider = parseProvider(req.params.provider)
    const client = provider && getOAuthClient(provider)
    if (!provider || !client) {
      redirectWithError(res, 'OAUTH_UNAVAILABLE', redirect)
      return
    }

    const state = randomToken()
    const pkce = createPkcePair()
    const payload = {
      provider,
      state,
      verifier: pkce.verifier,
      redirect,
      rememberMe: req.query.remember === '1' || req.query.remember === 'true',
    } satisfies z.infer<typeof stateSchema>
    res.cookie(
      OAUTH_STATE_COOKIE,
      signPayload('oauth-state', payload, OAUTH_STATE_TTL_SECONDS),
      oauthCookieOptions(OAUTH_STATE_TTL_SECONDS),
    )
    res.redirect(
      303,
      client.authorizationUrl({
        state,
        codeChallenge: pkce.challenge,
        redirectUri: callbackUrl(provider),
      }),
    )
  })

  /** Provider redirect target: GET /auth/oauth/:provider/callback?code=…&state=… */
  router.get('/:provider/callback', limiter, async (req, res) => {
    const cookies = req.cookies as Record<string, string | undefined>
    const saved = verifyPayload('oauth-state', cookies[OAUTH_STATE_COOKIE], stateSchema)
    res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieOptions())

    const redirect = safeRedirectPath(saved?.redirect)
    const provider = parseProvider(req.params.provider)
    const client = provider && getOAuthClient(provider)
    if (!provider || !client) {
      redirectWithError(res, 'OAUTH_UNAVAILABLE', redirect)
      return
    }

    const { code, state, error } = req.query
    if (typeof error === 'string') {
      redirectWithError(
        res,
        error === 'access_denied' ? 'OAUTH_CANCELLED' : 'OAUTH_FAILED',
        redirect,
      )
      return
    }
    if (
      saved?.provider !== provider ||
      typeof state !== 'string' ||
      typeof code !== 'string' ||
      !safeEqual(saved.state, state)
    ) {
      redirectWithError(res, 'OAUTH_FAILED', redirect)
      return
    }

    let profile
    try {
      profile = await client.fetchProfile({
        code,
        codeVerifier: saved.verifier,
        redirectUri: callbackUrl(provider),
      })
    } catch (fetchError) {
      req.log.warn({ err: fetchError, provider }, 'OAuth code exchange failed')
      redirectWithError(res, 'OAUTH_FAILED', redirect)
      return
    }

    const outcome = await resolveSignIn(provider, profile)
    switch (outcome.kind) {
      case 'signed-in':
        startSession(res, outcome.user, saved.rememberMe)
        redirectToApp(res, redirect)
        return
      case 'email-unverified':
        redirectWithError(res, 'OAUTH_EMAIL_UNVERIFIED', redirect)
        return
      case 'conflict':
        redirectWithError(res, 'OAUTH_ACCOUNT_CONFLICT', redirect)
        return
      case 'pending': {
        const pending: PendingSocial = {
          ...outcome.pending,
          redirect,
          rememberMe: saved.rememberMe,
        }
        res.cookie(
          OAUTH_PENDING_COOKIE,
          signPayload('oauth-pending', pending, OAUTH_PENDING_TTL_SECONDS),
          oauthCookieOptions(OAUTH_PENDING_TTL_SECONDS),
        )
        redirectToApp(res, pending.mode === 'signup' ? '/auth/social/confirm' : '/auth/social/link')
        return
      }
    }
  })

  return router
}
