import { Navigate, useLocation } from 'react-router'

import { paths } from '@/app/router/paths'
import { Spinner } from '@/components/shared/Spinner'
import { useCurrentWorkspaceId } from '@/features/workspaces/hooks'

import type { NoticeState } from '../components/RouteNotice'
import { useChannels } from '../hooks'

/**
 * `/app/workspaces/:workspaceId` opens the first active channel the user can
 * post in (falling back to the overview). Navigation state (e.g. a notice that
 * access to a channel was lost) is passed along.
 */
export function WorkspaceIndexRedirect() {
  const workspaceId = useCurrentWorkspaceId()
  const channels = useChannels(workspaceId)
  const location = useLocation()

  if (channels.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner label="Opening workspace" />
      </div>
    )
  }

  const target = channels.data?.find(
    (channel) => !channel.archivedAt && (channel.type === 'PUBLIC' || channel.isMember),
  )
  return (
    <Navigate
      to={target ? paths.channel(workspaceId, target.id) : paths.overview(workspaceId)}
      replace
      state={location.state as NoticeState | null}
    />
  )
}
