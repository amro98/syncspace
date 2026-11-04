import type { WorkspaceActor } from '@syncspace/shared'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useParams } from 'react-router'

import { useSession } from '@/features/auth/hooks'
import { queryKeys } from '@/lib/query-keys'

import { fetchWorkspace, fetchWorkspaces } from './api'

/** Workspaces the signed-in user belongs to (switcher, /app redirect). */
export function useWorkspaces() {
  return useQuery({
    queryKey: queryKeys.workspaces.list(),
    queryFn: ({ signal }) => fetchWorkspaces(signal),
  })
}

/** Workspace bootstrap: the workspace plus the current user's membership. */
export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.workspaces.detail(workspaceId),
    queryFn: ({ signal }) => fetchWorkspace(workspaceId, signal),
  })
}

/** The workspace selected by the URL (`/app/workspaces/:workspaceId/...`). */
export function useCurrentWorkspaceId(): string {
  const { workspaceId } = useParams()
  if (!workspaceId) throw new Error('useCurrentWorkspaceId used outside a workspace route')
  return workspaceId
}

/**
 * The signed-in user as a permission actor in the current workspace, for
 * deciding which controls to show (the API enforces the same rules).
 */
export function useWorkspaceActor(): WorkspaceActor | null {
  const workspaceId = useCurrentWorkspaceId()
  const { data: user } = useSession()
  const { data: workspace } = useWorkspace(workspaceId)
  const userId = user?.id
  const role = workspace?.membership.role
  // Stable identity: memoized rows (messages, cards) compare it by reference.
  return useMemo(() => (userId && role ? { userId, role } : null), [userId, role])
}
