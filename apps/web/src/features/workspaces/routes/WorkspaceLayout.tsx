import { useEffect } from 'react'
import { Link } from 'react-router'

import { AppShell } from '@/app/layouts/AppShell'
import { paths } from '@/app/router/paths'
import { FullPageSpinner } from '@/components/shared/Spinner'
import { buttonVariants } from '@/components/ui/button'
import { errorMessage } from '@/features/auth/messages'
import { useWorkspaceRoom } from '@/features/realtime/hooks'
import { useWorkspacePrefsStore } from '@/stores/workspace-prefs-store'

import { useCurrentWorkspaceId, useWorkspace } from '../hooks'

function WorkspaceUnavailable({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Workspace unavailable</h1>
      <p className="max-w-sm text-muted-foreground">{message}</p>
      <Link to={paths.app()} className={buttonVariants({ variant: 'outline' })}>
        Go to your workspaces
      </Link>
    </main>
  )
}

/**
 * Bootstraps `/app/workspaces/:workspaceId/*`: loads the workspace and the
 * user's membership (the API answers 404 to non-members), remembers it as the
 * last workspace, joins its realtime room, and renders the app shell.
 */
export function WorkspaceLayout() {
  const workspaceId = useCurrentWorkspaceId()
  const workspace = useWorkspace(workspaceId)
  const setLastWorkspaceId = useWorkspacePrefsStore((state) => state.setLastWorkspaceId)
  const loaded = workspace.isSuccess

  useEffect(() => {
    if (loaded) setLastWorkspaceId(workspaceId)
  }, [loaded, workspaceId, setLastWorkspaceId])

  useWorkspaceRoom(workspaceId)

  if (workspace.isPending) return <FullPageSpinner label="Loading workspace" />
  if (workspace.isError) {
    return (
      <WorkspaceUnavailable
        message={
          workspace.error.code === 'NOT_FOUND' || workspace.error.code === 'VALIDATION_ERROR'
            ? 'This workspace does not exist, or you are not a member of it.'
            : errorMessage(workspace.error)
        }
      />
    )
  }
  return <AppShell />
}
