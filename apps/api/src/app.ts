import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'

import { corsOptions } from '@/config/cors'
import { env } from '@/config/env'
import { errorHandler, notFoundHandler } from '@/middleware/error-handler'
import { requestLogger } from '@/middleware/request-logger'
import { verifyOrigin } from '@/middleware/verify-origin'
import { healthRouter } from '@/modules/health/health.router'

/**
 * Builds the Express application (no network side effects, so tests can mount
 * it with supertest). Feature modules are mounted under `/api/<resource>`.
 */
export function createApp(): Express {
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

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
