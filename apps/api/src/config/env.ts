import { existsSync } from 'node:fs'

import { z } from 'zod'

/**
 * Centralised, validated environment configuration. Nothing else in the API
 * reads `process.env` directly.
 *
 * - Development: sensible defaults so `npm run dev` works with an empty `.env`.
 * - Production: missing or weak security-relevant values fail fast at boot.
 */

const DEV_JWT_SECRET = 'syncspace-insecure-development-secret-do-not-use-in-production'

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const

const commaSeparatedUrls = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1))

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
    FRONTEND_URL: z.url().default('http://localhost:5173'),
    CORS_ORIGIN: commaSeparatedUrls.default(['http://localhost:5173']),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    if (!env.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'is required in production' })
    }
    if (!env.JWT_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'is required in production' })
    }
  })
  .transform(({ JWT_SECRET, ...env }) => ({
    ...env,
    JWT_SECRET: JWT_SECRET ?? DEV_JWT_SECRET,
    /** True when no JWT_SECRET was provided and the insecure dev fallback is in use. */
    usingDevJwtSecret: JWT_SECRET === undefined,
    isProduction: env.NODE_ENV === 'production',
  }))

export type Env = z.output<typeof envSchema>

/** Parses an environment source. Empty strings are treated as "not set". */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const defined = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  )
  const result = envSchema.safeParse(defined)
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }
  return result.data
}

function loadEnvFile(): void {
  // Tests must be hermetic; deployed environments inject real variables.
  if (process.env.NODE_ENV === 'test') return
  if (existsSync('.env')) process.loadEnvFile('.env')
}

loadEnvFile()

export const env = parseEnv(process.env)
