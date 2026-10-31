import { z } from 'zod'

import { AUTH_PROVIDERS, LIMITS } from '../constants/domain'
import { idSchema } from './common'
import { emailSchema } from './domain'

// ---------------------------------------------------------------------------
// Password policy — one rule list drives both validation and the UI checklist.
// ---------------------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 8
/** bcrypt only uses the first 72 BYTES, so the limit is enforced in bytes as well. */
export const PASSWORD_MAX_LENGTH = 72

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

export interface PasswordRule {
  id: 'length' | 'lowercase' | 'uppercase' | 'number' | 'special'
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `${String(PASSWORD_MIN_LENGTH)}–${String(PASSWORD_MAX_LENGTH)} characters`,
    test: (password) =>
      password.length >= PASSWORD_MIN_LENGTH && utf8ByteLength(password) <= PASSWORD_MAX_LENGTH,
  },
  { id: 'lowercase', label: 'A lowercase letter', test: (password) => /[a-z]/.test(password) },
  { id: 'uppercase', label: 'An uppercase letter', test: (password) => /[A-Z]/.test(password) },
  { id: 'number', label: 'A number', test: (password) => /[0-9]/.test(password) },
  {
    id: 'special',
    label: 'A special character',
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
]

/** New passwords (register, reset). Reports every unmet rule. */
export const passwordSchema = z.string().superRefine((password, ctx) => {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(password)) {
      ctx.addIssue({ code: 'custom', message: `Password needs: ${rule.label.toLowerCase()}` })
    }
  }
})

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const userNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name')
  .max(LIMITS.USER_NAME_MAX, `Use at most ${String(LIMITS.USER_NAME_MAX)} characters`)

export const registerInputSchema = z.object({
  name: userNameSchema,
  email: emailSchema,
  password: passwordSchema,
  rememberMe: z.boolean().default(false),
})

/** Login never applies the password policy (old passwords must still work). */
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(1024),
  rememberMe: z.boolean().default(false),
})

export const forgotPasswordInputSchema = z.object({
  email: emailSchema,
})

/** Opaque URL-safe token from an email link (reset or invite). */
export const emailTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)

export const verifyResetTokenInputSchema = z.object({
  token: emailTokenSchema,
})

export const resetPasswordInputSchema = z.object({
  token: emailTokenSchema,
  password: passwordSchema,
})

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const authProviderSchema = z.enum(AUTH_PROVIDERS)

/** The signed-in user as the client sees it. Never contains auth internals. */
export const authUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  /** False for social-only accounts (they can set one through "Forgot password"). */
  hasPassword: z.boolean(),
  providers: z.array(authProviderSchema),
})

export const authSessionResponseSchema = z.object({
  user: authUserSchema,
})

/** Social providers configured on the server. */
export const authProvidersResponseSchema = z.object({
  providers: z.array(authProviderSchema),
})

export const messageResponseSchema = z.object({
  message: z.string(),
})

// ---------------------------------------------------------------------------
// Social sign-in
// ---------------------------------------------------------------------------

export const OAUTH_PENDING_MODES = ['signup', 'link'] as const

/** Public view of a pending social sign-up/link awaiting the user's confirmation. */
export const oauthPendingSchema = z.object({
  mode: z.enum(OAUTH_PENDING_MODES),
  provider: authProviderSchema,
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
})

export const oauthConfirmResponseSchema = z.object({
  user: authUserSchema,
  /** Safe in-app path to continue to (e.g. an invitation the user was accepting). */
  redirectTo: z.string(),
})
