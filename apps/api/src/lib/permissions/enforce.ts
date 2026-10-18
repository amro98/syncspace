import { forbidden, notFound } from '@/lib/errors'

/**
 * Enforcement helpers. Services call a policy function from @syncspace/shared
 * and pass the result here, so every denial produces the same error contract:
 *
 *   ensureVisible(canAccessChannel(actor, channel))      // 404 if the actor may not see it
 *   authorize(canManageChannel(actor, channel))          // 403 if they see it but may not act
 *
 * Use `ensureVisible` first: a resource the actor cannot see must look exactly
 * like a resource that does not exist (no existence leaks via 403).
 */

export function ensureVisible(visible: boolean, message = 'Resource not found'): void {
  if (!visible) throw notFound(message)
}

export function authorize(allowed: boolean, message?: string): void {
  if (!allowed) throw forbidden(message)
}
