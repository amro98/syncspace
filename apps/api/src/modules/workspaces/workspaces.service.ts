import type { CreateWorkspaceInput, WorkspaceDetail, WorkspaceSummary } from '@syncspace/shared'

import { AppError } from '@/lib/errors'
import { getPrisma } from '@/lib/prisma'
import { isUniqueViolation } from '@/lib/prisma-errors'

import type { WorkspaceAccess } from './workspace-access'

/** Every new workspace starts with this public channel. */
export const DEFAULT_CHANNEL = { name: 'general', slug: 'general' } as const

/**
 * Creates a workspace with its creator as OWNER and a #general channel, in one
 * transaction (the database verifies at commit that owner_id is the single
 * OWNER member).
 */
export async function createWorkspace(
  userId: string,
  input: CreateWorkspaceInput,
): Promise<WorkspaceDetail> {
  try {
    const workspace = await getPrisma().workspace.create({
      data: {
        name: input.name,
        slug: input.slug,
        ownerId: userId,
        members: { create: { userId, role: 'OWNER' } },
        channels: {
          create: {
            ...DEFAULT_CHANNEL,
            description: 'Company-wide announcements and conversation',
            type: 'PUBLIC',
            createdById: userId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        createdAt: true,
        members: { where: { userId }, select: { role: true, joinedAt: true } },
      },
    })
    const [membership] = workspace.members
    if (!membership) throw new Error('Owner membership missing after workspace creation')
    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      ownerId: workspace.ownerId,
      createdAt: workspace.createdAt.toISOString(),
      memberCount: 1,
      membership: { role: membership.role, joinedAt: membership.joinedAt.toISOString() },
    }
  } catch (error) {
    if (isUniqueViolation(error, 'slug')) {
      throw new AppError('SLUG_TAKEN', 'That workspace URL is already taken. Try another.')
    }
    throw error
  }
}

/** Workspaces the user belongs to, for the switcher (alphabetical). */
export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const memberships = await getPrisma().workspaceMember.findMany({
    where: { userId },
    select: {
      role: true,
      workspace: {
        select: { id: true, name: true, slug: true, _count: { select: { members: true } } },
      },
    },
    orderBy: { workspace: { name: 'asc' } },
  })
  return memberships.map(({ role, workspace }) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
    memberCount: workspace._count.members,
  }))
}

/** Workspace bootstrap for a member (access already verified by the guard). */
export async function getWorkspaceDetail(access: WorkspaceAccess): Promise<WorkspaceDetail> {
  const workspace = await getPrisma().workspace.findUniqueOrThrow({
    where: { id: access.workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  })
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    ownerId: workspace.ownerId,
    createdAt: workspace.createdAt.toISOString(),
    memberCount: workspace._count.members,
    membership: {
      role: access.membership.role,
      joinedAt: access.membership.joinedAt.toISOString(),
    },
  }
}
