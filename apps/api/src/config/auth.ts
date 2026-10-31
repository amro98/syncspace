import { env } from './env'

/** httpOnly cookie carrying the session JWT (HTTP and the Socket.IO handshake). */
export const SESSION_COOKIE = 'ss_session'

/** Short-lived, signed OAuth `state` + PKCE verifier (set on /auth/oauth/:provider). */
export const OAUTH_STATE_COOKIE = 'ss_oauth_state'

/** Short-lived, signed pending social sign-up/link awaiting the user's confirmation. */
export const OAUTH_PENDING_COOKIE = 'ss_oauth_pending'

/** OAuth cookies are only needed by the OAuth routes. */
export const OAUTH_COOKIE_PATH = '/auth/oauth'

const HOUR = 60 * 60
const DAY = 24 * HOUR

/**
 * Session lifetime. The JWT expiry always equals the cookie lifetime:
 * - standard: browser-session cookie (no Max-Age), JWT valid for 12 hours;
 * - remembered ("Remember me"): persistent cookie and JWT, 30 days.
 */
export const SESSION_TTL_SECONDS = {
  standard: 12 * HOUR,
  remembered: 30 * DAY,
} as const

export const OAUTH_STATE_TTL_SECONDS = 10 * 60
export const OAUTH_PENDING_TTL_SECONDS = 15 * 60

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000

/** bcrypt cost. Lowered in tests only, where hashing speed matters and secrecy does not. */
export const BCRYPT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 12
