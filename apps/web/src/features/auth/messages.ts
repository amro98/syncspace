import type { ErrorCode } from '@syncspace/shared'

import { type ApiErrorCode, isApiError } from '@/lib/api-client'

/**
 * User-facing copy for API error codes. The server's `message` is used when a
 * code has no specific copy here (it is always written for end users).
 */
const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  NETWORK_ERROR: 'Cannot reach SyncSpace. Check your connection and try again.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  OAUTH_UNAVAILABLE: 'That sign-in provider is not available right now. Use another option.',
  OAUTH_FAILED: 'Sign-in with the provider failed. Please try again.',
  OAUTH_CANCELLED: 'Sign-in was cancelled.',
  OAUTH_EMAIL_UNVERIFIED:
    'Your provider account has no verified email address. Verify it with the provider, or sign up with email.',
  OAUTH_ACCOUNT_CONFLICT:
    'That provider account is already linked to another SyncSpace account, or yours is linked to a different one.',
  OAUTH_PENDING_EXPIRED: 'This sign-in request expired. Please start again.',
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (!isApiError(error)) return fallback
  return MESSAGES[error.code] ?? error.message
}

/** Copy for `?error=CODE` after an OAuth redirect back to /login. */
export function oauthRedirectError(code: string | null): string | null {
  if (!code) return null
  return MESSAGES[code as ErrorCode] ?? MESSAGES.OAUTH_FAILED ?? null
}
