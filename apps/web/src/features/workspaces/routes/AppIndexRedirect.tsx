import { Navigate } from 'react-router'

import { paths } from '@/app/router/paths'
import { FullPageSpinner } from '@/components/shared/Spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { errorMessage } from '@/features/auth/messages'
import { useWorkspacePrefsStore } from '@/stores/workspace-prefs-store'

import { useWorkspaces } from '../hooks'

/**
 * `/app` lands somewhere useful: onboarding for a user without workspaces,
 * otherwise the last workspace they opened (if they still belong to it — the
 * list comes from the server) or the first one.
 */
export function AppIndexRedirect() {
  const workspaces = useWorkspaces()
  const lastWorkspaceId = useWorkspacePrefsStore((state) => state.lastWorkspaceId)

  if (workspaces.isPending) return <FullPageSpinner label="Loading your workspaces" />
  if (workspaces.isError) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{errorMessage(workspaces.error)}</AlertDescription>
        </Alert>
      </main>
    )
  }

  const items = workspaces.data
  const target = items.find((workspace) => workspace.id === lastWorkspaceId) ?? items[0]
  return <Navigate to={target ? paths.workspace(target.id) : paths.onboarding()} replace />
}
