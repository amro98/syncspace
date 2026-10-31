import type { WorkspaceActor, WorkspaceRole } from '@syncspace/shared'
import type { Request, RequestHandler } from 'express'
import { z } from 'zod'

import { canViewWorkspace, ensureVisible, toActor } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'

export interface WorkspaceAccess {
  workspaceId: string
  actor: WorkspaceActor & { role: WorkspaceRole }
  membership: { role: WorkspaceRole; joinedAt: Date }
}

const paramsSchema = z.object({ workspaceId: z.uuid() })

/**
 * Guards every /workspaces/:workspaceId/* route: loads the caller's membership
 * once and attaches it as `req.workspaceAccess`. Non-members get 404 — a
 * workspace you do not belong to is indistinguishable from one that does not
 * exist. Handlers then use the policy functions with `access.actor`.
 */
export const requireWorkspaceMember: RequestHandler = async (req, _res, next) => {
  const { workspaceId } = paramsSchema.parse(req.params)
  const userId = req.auth?.userId ?? ''
  const membership = await getPrisma().workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, joinedAt: true },
  })
  ensureVisible(canViewWorkspace(toActor(userId, membership)), 'Workspace not found')
  // canViewWorkspace implies a membership row; this only narrows the type.
  if (!membership) throw new Error('Unreachable: visible workspace without membership')

  req.workspaceAccess = {
    workspaceId,
    actor: { userId, role: membership.role },
    membership,
  }
  next()
}

export function getWorkspaceAccess(req: Request): WorkspaceAccess {
  if (!req.workspaceAccess) {
    throw new Error('requireWorkspaceMember must run before this handler')
  }
  return req.workspaceAccess
}
