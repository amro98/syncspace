/**
 * Machine-readable error codes returned by the REST API (in the error body)
 * and by socket acknowledgements. Clients branch on `code`, never on `message`.
 *
 * Generic codes cover most cases; domain codes exist where the client must
 * show a specific explanation or offer a specific next step.
 */
export const ERROR_CODES = {
  // Generic
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Authentication
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** Social-only account tried password login: continue with a provider or set a password. */
  PASSWORD_NOT_SET: 'PASSWORD_NOT_SET',
  RESET_TOKEN_INVALID: 'RESET_TOKEN_INVALID',
  RESET_TOKEN_EXPIRED: 'RESET_TOKEN_EXPIRED',
  RESET_TOKEN_USED: 'RESET_TOKEN_USED',

  // Social sign-in (also used as `?error=` on OAuth redirects back to the web app)
  OAUTH_UNAVAILABLE: 'OAUTH_UNAVAILABLE',
  OAUTH_FAILED: 'OAUTH_FAILED',
  OAUTH_CANCELLED: 'OAUTH_CANCELLED',
  OAUTH_EMAIL_UNVERIFIED: 'OAUTH_EMAIL_UNVERIFIED',
  /** The provider account is linked elsewhere, or the user already linked another account of that provider. */
  OAUTH_ACCOUNT_CONFLICT: 'OAUTH_ACCOUNT_CONFLICT',
  /** The short-lived pending sign-up/link expired or no longer matches the database. */
  OAUTH_PENDING_EXPIRED: 'OAUTH_PENDING_EXPIRED',

  // Workspaces & invitations
  SLUG_TAKEN: 'SLUG_TAKEN',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  INVITE_INVALID: 'INVITE_INVALID',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_EMAIL_MISMATCH: 'INVITE_EMAIL_MISMATCH',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** Default HTTP status for each error code. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,

  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  PASSWORD_NOT_SET: 401,
  RESET_TOKEN_INVALID: 400,
  RESET_TOKEN_EXPIRED: 400,
  RESET_TOKEN_USED: 400,

  OAUTH_UNAVAILABLE: 503,
  OAUTH_FAILED: 400,
  OAUTH_CANCELLED: 400,
  OAUTH_EMAIL_UNVERIFIED: 400,
  OAUTH_ACCOUNT_CONFLICT: 409,
  OAUTH_PENDING_EXPIRED: 400,

  SLUG_TAKEN: 409,
  ALREADY_MEMBER: 409,
  INVITE_INVALID: 404,
  INVITE_EXPIRED: 410,
  INVITE_EMAIL_MISMATCH: 403,
}
