const MAX_REDIRECT_LENGTH = 512

/**
 * Sanitises a post-authentication redirect target (`?redirect=` / OAuth
 * `returnTo`). Only same-app absolute paths are allowed — never another
 * origin ("//evil.com", "https://...", "/\\evil.com") — so a crafted link
 * cannot turn sign-in into an open redirect.
 */
export function safeRedirectPath(value: unknown, fallback = '/app'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_REDIRECT_LENGTH) {
    return fallback
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  // Control characters (including tabs/newlines browsers strip) are never legitimate here.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback
  return value
}
