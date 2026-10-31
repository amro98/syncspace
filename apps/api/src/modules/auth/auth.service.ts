import type { LoginInput, RegisterInput, ResetPasswordInput } from '@syncspace/shared'

import { PASSWORD_RESET_TTL_MS } from '@/config/auth'
import { env } from '@/config/env'
import { sha256, randomToken } from '@/lib/crypto'
import { AppError, notFound } from '@/lib/errors'
import { mailer } from '@/lib/mail/mailer'
import { passwordResetEmail } from '@/lib/mail/templates'
import { burnPasswordCheck, hashPassword, verifyPassword } from '@/lib/password'
import { getPrisma } from '@/lib/prisma'
import { isUniqueViolation } from '@/lib/prisma-errors'

import { authUserSelect, type AuthUserRow } from './auth-user'

const invalidCredentials = () => new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.')

export async function registerUser(input: RegisterInput): Promise<AuthUserRow> {
  const passwordHash = await hashPassword(input.password)
  try {
    return await getPrisma().user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: authUserSelect,
    })
  } catch (error) {
    if (isUniqueViolation(error, 'email')) {
      throw new AppError(
        'EMAIL_TAKEN',
        'An account with this email already exists. Sign in instead.',
      )
    }
    throw error
  }
}

/**
 * Password login. Unknown emails and wrong passwords produce the same error
 * after the same amount of bcrypt work. The one deliberate exception is a
 * social-only account, which is told how it can sign in.
 */
export async function loginWithPassword(input: LoginInput): Promise<AuthUserRow> {
  const user = await getPrisma().user.findUnique({
    where: { email: input.email },
    select: authUserSelect,
  })

  if (!user) {
    await burnPasswordCheck(input.password)
    throw invalidCredentials()
  }

  if (user.passwordHash === null) {
    await burnPasswordCheck(input.password)
    if (user.authAccounts.length === 0) throw invalidCredentials()
    throw new AppError(
      'PASSWORD_NOT_SET',
      'This account signs in with Google or GitHub. Continue with your provider, or use “Forgot password” to set a password.',
    )
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) throw invalidCredentials()
  return user
}

export async function getAuthUser(userId: string): Promise<AuthUserRow> {
  const user = await getPrisma().user.findUnique({ where: { id: userId }, select: authUserSelect })
  if (!user) throw notFound('User not found')
  return user
}

// ---------------------------------------------------------------------------
// Password reset (also how social-only accounts set their first password)
// ---------------------------------------------------------------------------

/**
 * Issues a reset token and emails it, if the account exists. Callers must not
 * reveal the outcome. Older unused tokens of the user are invalidated.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const prisma = getPrisma()
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  })
  if (!user) return

  const token = randomToken()
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    }),
  ])

  const url = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`
  mailer.sendInBackground(passwordResetEmail({ to: user.email, name: user.name, url }))
}

/** Looks up a reset token by hash; throws a specific error unless it is usable right now. */
export async function findUsableResetToken(token: string) {
  const row = await getPrisma().passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  })
  if (!row) {
    throw new AppError('RESET_TOKEN_INVALID', 'This reset link is invalid. Request a new one.')
  }
  if (row.usedAt) {
    throw new AppError(
      'RESET_TOKEN_USED',
      'This reset link has already been used. Request a new one.',
    )
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new AppError('RESET_TOKEN_EXPIRED', 'This reset link has expired. Request a new one.')
  }
  return row
}

/**
 * Sets the new password, consumes the token (exactly once, even under
 * concurrent requests), deletes the user's other reset tokens, and increments
 * tokenVersion so every existing session is revoked.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const row = await findUsableResetToken(input.token)
  const passwordHash = await hashPassword(input.password)
  const now = new Date()

  await getPrisma().$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (claimed.count !== 1) {
      throw new AppError(
        'RESET_TOKEN_USED',
        'This reset link has already been used. Request a new one.',
      )
    }
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    })
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId, usedAt: null } })
  })
}
