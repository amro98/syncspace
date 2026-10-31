import { Prisma } from '@/generated/prisma/client'

/**
 * True when `error` is a unique-constraint violation. With `field`, only when
 * the violated constraint involves that column/field (matched against the
 * error metadata, which differs slightly between engines and adapters).
 */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false
  }
  if (!field) return true
  return JSON.stringify(error.meta ?? {}).includes(field)
}
