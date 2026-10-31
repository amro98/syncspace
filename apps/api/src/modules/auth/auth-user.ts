import type { AuthUser } from '@syncspace/shared'

import type { Prisma } from '@/generated/prisma/client'

/**
 * The only user fields auth code loads. `passwordHash` is read solely to derive
 * `hasPassword`; `tokenVersion` solely to sign sessions. Neither is ever
 * serialised — responses go through `toAuthUser`.
 */
export const authUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  passwordHash: true,
  tokenVersion: true,
  authAccounts: { select: { provider: true }, orderBy: { provider: 'asc' } },
} satisfies Prisma.UserSelect

export type AuthUserRow = Prisma.UserGetPayload<{ select: typeof authUserSelect }>

export function toAuthUser(user: AuthUserRow): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    hasPassword: user.passwordHash !== null,
    providers: user.authAccounts.map((account) => account.provider),
  }
}
