import {
  type CreateInviteInput,
  evaluateInviteAcceptance,
  INVITE_TTL_DAYS,
  type InvitePreview,
  type WorkspaceInvite,
} from '@syncspace/shared'

import { env } from '@/config/env'
import { randomToken, sha256 } from '@/lib/crypto'
import { AppError } from '@/lib/errors'
import { mailer } from '@/lib/mail/mailer'
import { workspaceInviteEmail } from '@/lib/mail/templates'
import { authorize, canInviteMember } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import { isUniqueViolation } from '@/lib/prisma-errors'

import type { WorkspaceAccess } from './workspace-access'

const DAY_MS = 24 * 60 * 60 * 1000

const invalidInvite = () =>
  new AppError('INVITE_INVALID', 'This invitation link is invalid or has been revoked.')

/**
 * Invites an email address to the workspace. Allowed roles follow the central
 * policy (OWNER invites ADMIN/MEMBER, ADMIN invites MEMBER, never OWNER).
 * Re-inviting refreshes the pending invitation (new token, role and expiry)
 * instead of creating a second one. Only the token's hash is stored; the raw
 * token goes into the email and nowhere else.
 */
export async function createInvite(
  access: WorkspaceAccess,
  input: CreateInviteInput,
): Promise<WorkspaceInvite> {
  authorize(
    canInviteMember(access.actor, input.role),
    input.role === 'ADMIN'
      ? 'Only the workspace owner can invite admins.'
      : 'Only workspace owners and admins can invite people.',
  )

  const prisma = getPrisma()
  const [workspace, inviter, existingMember] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: access.workspaceId },
      select: { name: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: access.actor.userId }, select: { name: true } }),
    prisma.workspaceMember.findFirst({
      where: { workspaceId: access.workspaceId, user: { email: input.email } },
      select: { id: true },
    }),
  ])
  if (existingMember) {
    throw new AppError('ALREADY_MEMBER', `${input.email} is already a member of this workspace.`)
  }

  const token = randomToken()
  const data = {
    role: input.role,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS),
    createdById: access.actor.userId,
  }

  let invite
  try {
    const pending = await prisma.workspaceInvite.findFirst({
      where: {
        workspaceId: access.workspaceId,
        email: input.email,
        acceptedAt: null,
        revokedAt: null,
      },
      select: { id: true },
    })
    const select = { id: true, email: true, role: true, expiresAt: true, createdAt: true } as const
    invite = pending
      ? await prisma.workspaceInvite.update({ where: { id: pending.id }, data, select })
      : await prisma.workspaceInvite.create({
          data: { ...data, workspaceId: access.workspaceId, email: input.email },
          select,
        })
  } catch (error) {
    // Two concurrent invitations for the same email: the partial unique index picked one.
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 'An invitation for this email is being sent. Try again.')
    }
    throw error
  }

  mailer.sendInBackground(
    workspaceInviteEmail({
      to: input.email,
      workspaceName: workspace.name,
      inviterName: inviter.name,
      role: input.role,
      url: `${env.FRONTEND_URL}/invite/${encodeURIComponent(token)}`,
    }),
  )

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  }
}

function findInviteByToken(token: string) {
  return getPrisma().workspaceInvite.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      workspace: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  })
}

/** Public preview for the invitation page (the token itself is the credential). */
export async function previewInvite(token: string): Promise<InvitePreview> {
  const invite = await findInviteByToken(token)
  if (!invite) throw invalidInvite()

  const status = invite.acceptedAt
    ? 'ACCEPTED'
    : invite.revokedAt
      ? 'REVOKED'
      : invite.expiresAt.getTime() <= Date.now()
        ? 'EXPIRED'
        : 'PENDING'

  return {
    workspace: invite.workspace,
    inviterName: invite.createdBy?.name ?? null,
    role: invite.role,
    email: invite.email,
    status,
    expiresAt: invite.expiresAt.toISOString(),
  }
}

/**
 * Accepts an invitation for the signed-in user: the token must be pending,
 * unexpired and addressed to the user's own email. Accepting again (or
 * accepting when already a member) is a safe no-op that returns the workspace.
 */
export async function acceptInvite(
  userId: string,
  token: string,
): Promise<{ workspaceId: string }> {
  const prisma = getPrisma()
  const invite = await findInviteByToken(token)
  if (!invite) throw invalidInvite()

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  })
  const isMember = async () =>
    (await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
      select: { id: true },
    })) !== null

  const decision = evaluateInviteAcceptance(user, invite, new Date())
  if (!decision.ok) {
    switch (decision.reason) {
      case 'accepted':
        // Idempotent: the same person following the link again just continues.
        if (user.email === invite.email && (await isMember())) {
          return { workspaceId: invite.workspaceId }
        }
        throw invalidInvite()
      case 'revoked':
        throw invalidInvite()
      case 'expired':
        throw new AppError(
          'INVITE_EXPIRED',
          'This invitation has expired. Ask a workspace admin to send a new one.',
        )
      case 'email_mismatch':
        throw new AppError(
          'INVITE_EMAIL_MISMATCH',
          `This invitation was sent to ${invite.email}. Sign in with that email to accept it.`,
        )
    }
  }

  await prisma.$transaction(async (tx) => {
    // Claim the invite exactly once; a concurrent accept falls through harmlessly.
    await tx.workspaceInvite.updateMany({
      where: { id: invite.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    })
    // Existing members keep their current role.
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
      update: {},
      create: { workspaceId: invite.workspaceId, userId, role: invite.role },
    })
  })

  return { workspaceId: invite.workspaceId }
}
