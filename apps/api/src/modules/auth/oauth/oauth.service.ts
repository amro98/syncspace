import { AUTH_PROVIDERS, type AuthProvider, type OAuthPending } from '@syncspace/shared'
import { z } from 'zod'

import { AppError } from '@/lib/errors'
import { getPrisma } from '@/lib/prisma'
import { isUniqueViolation } from '@/lib/prisma-errors'
import { authUserSelect, type AuthUserRow } from '@/modules/auth/auth-user'

import type { OAuthProfile } from './providers'

/**
 * Signed contents of the pending cookie. Holds only what the provider already
 * proved (account id, VERIFIED email) plus where to continue afterwards.
 */
export const pendingSocialSchema = z.object({
  mode: z.enum(['signup', 'link']),
  provider: z.enum(AUTH_PROVIDERS),
  providerAccountId: z.string().min(1),
  email: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().nullable(),
  /** link mode: the existing user whose email matched. */
  userId: z.uuid().nullable(),
  redirect: z.string(),
  rememberMe: z.boolean(),
})

export type PendingSocial = z.infer<typeof pendingSocialSchema>

export type SignInOutcome =
  | { kind: 'signed-in'; user: AuthUserRow }
  | { kind: 'pending'; pending: Omit<PendingSocial, 'redirect' | 'rememberMe'> }
  | { kind: 'email-unverified' }
  | { kind: 'conflict' }

const pendingExpired = (message = 'This sign-in request expired. Please start again.') =>
  new AppError('OAUTH_PENDING_EXPIRED', message)

const accountConflict = (provider: AuthProvider) =>
  new AppError(
    'OAUTH_ACCOUNT_CONFLICT',
    `This ${provider === 'GOOGLE' ? 'Google' : 'GitHub'} account cannot be linked: it is already linked elsewhere, or your account is linked to a different one.`,
  )

/**
 * Decides what a completed provider sign-in means. Never creates a user and
 * never links silently:
 *   A. known provider account          -> sign in
 *   B. new provider, email unknown     -> pending sign-up (needs confirmation)
 *   C. new provider, email matches     -> pending link   (needs confirmation)
 * Unverified provider emails are refused outright (they could belong to anyone).
 */
export async function resolveSignIn(
  provider: AuthProvider,
  profile: OAuthProfile,
): Promise<SignInOutcome> {
  const prisma = getPrisma()
  const account = await prisma.authAccount.findUnique({
    where: {
      provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId },
    },
    select: { user: { select: authUserSelect } },
  })
  if (account) return { kind: 'signed-in', user: account.user }

  if (!profile.email || !profile.emailVerified) return { kind: 'email-unverified' }
  const email = profile.email.trim().toLowerCase()

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, authAccounts: { where: { provider }, select: { id: true } } },
  })
  const base = {
    provider,
    providerAccountId: profile.providerAccountId,
    email,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  }

  if (!existing) return { kind: 'pending', pending: { ...base, mode: 'signup', userId: null } }
  // The user already has a *different* account of this provider linked.
  if (existing.authAccounts.length > 0) return { kind: 'conflict' }
  return { kind: 'pending', pending: { ...base, mode: 'link', userId: existing.id } }
}

export function toPublicPending(pending: PendingSocial): OAuthPending {
  return {
    mode: pending.mode,
    provider: pending.provider,
    email: pending.email,
    name: pending.name,
    avatarUrl: pending.avatarUrl,
  }
}

/**
 * Completes a pending sign-up or link after the user confirmed it. Everything
 * is re-validated against the current database state inside one transaction.
 */
export async function confirmPending(pending: PendingSocial): Promise<AuthUserRow> {
  const prisma = getPrisma()
  const accountData = { provider: pending.provider, providerAccountId: pending.providerAccountId }

  try {
    return await prisma.$transaction(async (tx) => {
      const linked = await tx.authAccount.findUnique({
        where: { provider_providerAccountId: accountData },
        select: { userId: true },
      })
      if (linked) throw accountConflict(pending.provider)

      if (pending.mode === 'signup') {
        const taken = await tx.user.findUnique({
          where: { email: pending.email },
          select: { id: true },
        })
        if (taken) {
          throw pendingExpired(
            'An account with this email was created in the meantime. Sign in again to link it.',
          )
        }
        return tx.user.create({
          data: {
            email: pending.email,
            name: pending.name,
            avatarUrl: pending.avatarUrl,
            authAccounts: { create: accountData },
          },
          select: authUserSelect,
        })
      }

      // Link: the account must still exist and still own the verified email.
      const user = pending.userId
        ? await tx.user.findUnique({
            where: { id: pending.userId },
            select: { email: true, avatarUrl: true },
          })
        : null
      if (user?.email !== pending.email) throw pendingExpired()

      return tx.user.update({
        where: { id: pending.userId ?? '' },
        data: {
          authAccounts: { create: accountData },
          ...(user.avatarUrl === null && { avatarUrl: pending.avatarUrl }),
        },
        select: authUserSelect,
      })
    })
  } catch (error) {
    // Races: someone registered the email meanwhile, or a concurrent confirmation /
    // the per-provider uniqueness of (user, provider) won.
    if (isUniqueViolation(error, 'email')) {
      throw pendingExpired(
        'An account with this email was created in the meantime. Sign in again to link it.',
      )
    }
    if (isUniqueViolation(error)) throw accountConflict(pending.provider)
    throw error
  }
}
