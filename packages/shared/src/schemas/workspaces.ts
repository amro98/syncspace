import { z } from 'zod'

import { LIMITS } from '../constants/domain'
import { cursorPageSchema, idSchema, isoDateTimeSchema } from './common'
import {
  assignableWorkspaceRoleSchema,
  emailSchema,
  slugSchema,
  workspaceRoleSchema,
} from './domain'
import { emailTokenSchema } from './auth'

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a workspace name')
  .max(LIMITS.WORKSPACE_NAME_MAX, `Use at most ${String(LIMITS.WORKSPACE_NAME_MAX)} characters`)

export const createWorkspaceInputSchema = z.object({
  name: workspaceNameSchema,
  slug: slugSchema.min(2, 'Use at least 2 characters'),
})

/** One entry of the workspace switcher. */
export const workspaceSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  role: workspaceRoleSchema,
  memberCount: z.number().int().nonnegative(),
})

export const workspaceListResponseSchema = cursorPageSchema(workspaceSummarySchema)

/** Workspace bootstrap: the workspace plus the current user's membership. */
export const workspaceDetailSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  ownerId: idSchema,
  createdAt: isoDateTimeSchema,
  memberCount: z.number().int().nonnegative(),
  membership: z.object({
    role: workspaceRoleSchema,
    joinedAt: isoDateTimeSchema,
  }),
})

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const INVITE_TTL_DAYS = 7

export const createInviteInputSchema = z.object({
  email: emailSchema,
  role: assignableWorkspaceRoleSchema.default('MEMBER'),
})

export const workspaceInviteSchema = z.object({
  id: idSchema,
  email: z.string(),
  role: workspaceRoleSchema,
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
})

/** Invitation tokens travel in request bodies (never URLs) so they stay out of API logs. */
export const inviteTokenInputSchema = z.object({
  token: emailTokenSchema,
})

export const INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const

/** What the invitee sees before accepting (shown whether or not they are signed in). */
export const invitePreviewSchema = z.object({
  workspace: z.object({ id: idSchema, name: z.string() }),
  inviterName: z.string().nullable(),
  role: workspaceRoleSchema,
  email: z.string(),
  status: z.enum(INVITE_STATUSES),
  expiresAt: isoDateTimeSchema,
})

export const acceptInviteResponseSchema = z.object({
  workspaceId: idSchema,
})
