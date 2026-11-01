import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'

import { corsOptions } from '@/config/cors'
import { env } from '@/config/env'
import { errorHandler, notFoundHandler } from '@/middleware/error-handler'
import { type AuthRateLimitOptions, createAuthRateLimiters } from '@/middleware/rate-limit'
import { requestLogger } from '@/middleware/request-logger'
import { verifyOrigin } from '@/middleware/verify-origin'
import { createAuthRouter } from '@/modules/auth/auth.router'
import { messagesRouter } from '@/modules/chat/chat.router'
import { devMailRouter } from '@/modules/dev/dev-mail.router'
import { healthRouter } from '@/modules/health/health.router'
import { invitesRouter, workspacesRouter } from '@/modules/workspaces/workspaces.router'

export interface AppOptions {
  /** Auth rate limiting. Enabled by default except in tests (which opt in explicitly). */
  rateLimit?: AuthRateLimitOptions
}

/**
 * Builds the Express application (no network side effects, so tests can mount
 * it with supertest). The API has its own origin, so resources mount at the
 * root: /auth, /workspaces, /invites, /messages.
 */
export function createApp({
  rateLimit = { enabled: env.NODE_ENV !== 'test' },
}: AppOptions = {}): Express {
  const app = express()

  // Render (and most PaaS) terminate TLS at a proxy; trust it for req.ip / secure cookies.
  if (env.isProduction) app.set('trust proxy', 1)

  app.use(requestLogger)
  app.use(helmet())
  app.use(cors(corsOptions))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(verifyOrigin)

  app.use('/health', healthRouter)
  app.use('/auth', createAuthRouter(createAuthRateLimiters(rateLimit)))
  app.use('/workspaces', workspacesRouter)
  app.use('/invites', invitesRouter)
  app.use('/messages', messagesRouter)

  // Captured-mail viewer; exists only in development (never in test or production).
  if (env.NODE_ENV === 'development') app.use('/dev/mail', devMailRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
