import type { CorsOptions } from 'cors'

import { env } from './env'

/**
 * Single CORS policy shared by Express and Socket.IO. Credentials are enabled
 * because authentication uses httpOnly cookies, which rules out `*` origins.
 */
export const corsOptions = {
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
} satisfies CorsOptions

const allowedOrigins = new Set(env.CORS_ORIGIN)

export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.has(origin)
}
