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

/** Absolute URL without a trailing slash (paths are appended to it). */
const baseUrl = z.url().transform((url) => url.replace(/\/+$/, ''))

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
    /** Public URL of the web app (links in emails, OAuth redirects back to the app). */
    FRONTEND_URL: baseUrl.optional(),
    /** Public URL of this API (OAuth callback URLs). */
    API_PUBLIC_URL: baseUrl.optional(),
    CORS_ORIGIN: commaSeparatedUrls.default(['http://localhost:5173']),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),

    // Session cookie. `lax` works when web and API share a registrable domain (see docs/AUTH.md).
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    /** Optional cookie Domain (e.g. ".syncspace.dev" to share across app./api. subdomains). */
    COOKIE_DOMAIN: z.string().optional(),

    // Social sign-in: a provider is enabled when both its id and secret are set.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    // Outgoing mail. Without SMTP_HOST, mail is captured in-process (dev viewer at /dev/mail).
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default('SyncSpace <no-reply@syncspace.local>'),

    // Attachments. "local" writes to disk (development only), "s3" uses any S3-compatible
    // provider (Cloudflare R2 recommended, see docs/UPLOADS.md), "disabled" turns uploads off.
    STORAGE_DRIVER: z.enum(['local', 's3', 'disabled']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('.uploads'),
    S3_BUCKET: z.string().optional(),
    /** "auto" for Cloudflare R2; the bucket's region for AWS S3. */
    S3_REGION: z.string().default('auto'),
    /** Custom endpoint (R2: https://<account-id>.r2.cloudflarestorage.com). Empty for AWS S3. */
    S3_ENDPOINT: z.url().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),
    /** Lifetime of signed download URLs. Short: links are re-issued on every open. */
    UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  })
  .superRefine((env, ctx) => {
    if (env.COOKIE_SAME_SITE === 'none' && env.NODE_ENV !== 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SAME_SITE'],
        message: '"none" requires Secure cookies, which only production (HTTPS) uses',
      })
    }
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'is required when STORAGE_DRIVER=s3',
          })
        }
      }
    }
    if (env.NODE_ENV !== 'production') return
    for (const key of ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL', 'API_PUBLIC_URL'] as const) {
      if (!env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'is required in production' })
      }
    }
    if (env.STORAGE_DRIVER === 'local') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message:
          'must be "s3" (or "disabled") in production: the local disk of a hosted container is not durable',
      })
    }
  })
  .transform(({ JWT_SECRET, FRONTEND_URL, API_PUBLIC_URL, ...env }) => ({
    ...env,
    storage: {
      driver: env.STORAGE_DRIVER,
      localDir: env.LOCAL_STORAGE_DIR,
      s3: {
        bucket: env.S3_BUCKET ?? '',
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        urlTtlSeconds: env.UPLOAD_URL_TTL_SECONDS,
      },
    },
    FRONTEND_URL: FRONTEND_URL ?? 'http://localhost:5173',
    API_PUBLIC_URL: API_PUBLIC_URL ?? `http://localhost:${String(env.PORT)}`,
    JWT_SECRET: JWT_SECRET ?? DEV_JWT_SECRET,
    /** True when no JWT_SECRET was provided and the insecure dev fallback is in use. */
    usingDevJwtSecret: JWT_SECRET === undefined,
    isProduction: env.NODE_ENV === 'production',
    oauth: {
      google:
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
          ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
          : null,
      github:
        env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
          ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
          : null,
    },
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
