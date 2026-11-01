import { Archive, Hash, Lock, Settings, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router'

import { paths } from '@/app/router/paths'
import { Spinner } from '@/components/shared/Spinner'
import { errorMessage } from '@/features/auth/messages'
import { useCurrentWorkspaceId, useWorkspaceActor } from '@/features/workspaces/hooks'
import { formatFullDate } from '@/lib/format'

import { ChannelSettingsDialog } from '../components/ChannelSettingsDialog'
import { ChatView } from '../components/ChatView'
import { RouteNotice, type NoticeState } from '../components/RouteNotice'
import { useChannels } from '../hooks'
import { channelPolicy } from '../policy'

export const CHANNEL_GONE_NOTICE =
  'That channel is not available. It may have been made private, or you no longer have access to it.'

/** `/app/workspaces/:workspaceId/channel/:channelId` — the URL is the source of truth. */
export function ChannelPage() {
  const workspaceId = useCurrentWorkspaceId()
  const { channelId = '' } = useParams()
  const channels = useChannels(workspaceId)
  const actor = useWorkspaceActor()
  const destination = useMemo(() => ({ kind: 'channel' as const, id: channelId }), [channelId])
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (channels.isPending || !actor) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner label="Loading channel" />
      </div>
    )
  }
  if (channels.isError) {
    return (
      <p className="p-6 text-sm text-danger" role="alert">
        {errorMessage(channels.error)}
      </p>
    )
  }

  const channel = channels.data.find((item) => item.id === channelId)
  if (!channel) {
    const state: NoticeState = { notice: CHANNEL_GONE_NOTICE }
    return <Navigate to={paths.workspace(workspaceId)} replace state={state} />
  }

  const Icon = channel.type === 'PRIVATE' ? Lock : Hash
  const header = (
    <header className="flex h-(--topbar-height) shrink-0 items-center gap-2 border-b px-4">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <h1 className="truncate font-semibold">
        <span className="sr-only">
          {channel.type === 'PRIVATE' ? 'Private channel ' : 'Channel '}
        </span>
        {channel.name}
      </h1>
      {channel.description && (
        <p className="hidden min-w-0 truncate border-l pl-2 text-sm text-muted-foreground sm:block">
          {channel.description}
        </p>
      )}
      <div className="flex-1" />
      {channel.memberCount !== null && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3.5" aria-hidden />
          {channel.memberCount}
          <span className="sr-only">{channel.memberCount === 1 ? 'member' : 'members'}</span>
        </span>
      )}
      <button
        type="button"
        aria-label="Channel details and settings"
        onClick={() => {
          setSettingsOpen(true)
        }}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Settings className="size-4" aria-hidden />
      </button>
    </header>
  )

  const banner = (
    <>
      <RouteNotice />
      {channel.archivedAt && (
        <div
          role="status"
          className="flex items-center gap-2 border-b bg-warning/10 px-4 py-2 text-sm"
        >
          <Archive className="size-4 shrink-0" aria-hidden />
          Archived on {formatFullDate(channel.archivedAt)}. This channel is read-only.
        </div>
      )}
    </>
  )

  return (
    <>
      <ChatView
        workspaceId={workspaceId}
        destination={destination}
        policy={channelPolicy(channel)}
        actor={actor}
        lastReadAt={channel.lastReadAt}
        header={header}
        banner={banner}
        placeholder={`Message ${channel.type === 'PRIVATE' ? '' : '#'}${channel.name}`}
        emptyState={
          <div className="px-4 pt-10 pb-4">
            <p className="text-lg font-semibold">
              Welcome to {channel.type === 'PRIVATE' ? '' : '#'}
              {channel.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {channel.description ?? 'This is the very beginning of the channel. Say hello!'}
            </p>
          </div>
        }
      />
      <ChannelSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        workspaceId={workspaceId}
        channel={channel}
        actor={actor}
      />
    </>
  )
}
