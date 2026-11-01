import type { WorkspaceMember } from '@syncspace/shared'

import { getPrisma } from '@/lib/prisma'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'
import { presence } from '@/sockets/presence'

const MAX_MEMBERS = 500

/**
 * Workspace member directory (member pickers, DM list, presence). Visible to
 * members of the workspace only — the route is behind requireWorkspaceMember.
 * Policy: teammates may see each other's email; nothing auth-related leaves.
 */
export async function listWorkspaceMembers(
  workspace: WorkspaceAccess,
  query?: string,
): Promise<WorkspaceMember[]> {
  const q = query?.trim()
  const members = await getPrisma().workspaceMember.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      ...(q && {
        user: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
      }),
    },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true, avatarUrl: true, lastSeenAt: true } },
    },
    orderBy: { user: { name: 'asc' } },
    take: MAX_MEMBERS,
  })
  return members.map(({ role, user }) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role,
    online: presence.isOnline(user.id),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  }))
}
