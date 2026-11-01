import { Users } from 'lucide-react'
import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router'

import { paths } from '@/app/router/paths'
import { Avatar } from '@/components/shared/Avatar'
import { PresenceDot } from '@/components/shared/PresenceDot'
import { Spinner } from '@/components/shared/Spinner'
import { errorMessage } from '@/features/auth/messages'
import { useCurrentWorkspaceId, useWorkspaceActor } from '@/features/workspaces/hooks'
import { formatRelative } from '@/lib/format'

import { ChatView } from '../components/ChatView'
import { type NoticeState, RouteNotice } from '../components/RouteNotice'
import { useConversations, useWorkspaceMembers } from '../hooks'
import { conversationPolicy, conversationTitle, otherParticipants } from '../policy'

/** `/app/workspaces/:workspaceId/dm/:conversationId` (direct and group conversations). */
export function ConversationPage() {
  const workspaceId = useCurrentWorkspaceId()
  const { conversationId = '' } = useParams()
  const conversations = useConversations(workspaceId)
  const members = useWorkspaceMembers(workspaceId)
  const actor = useWorkspaceActor()
  const destination = useMemo(
    () => ({ kind: 'conversation' as const, id: conversationId }),
    [conversationId],
  )

  if (conversations.isPending || !actor) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner label="Loading conversation" />
      </div>
    )
  }
  if (conversations.isError) {
    return (
      <p className="p-6 text-sm text-danger" role="alert">
        {errorMessage(conversations.error)}
      </p>
    )
  }

  const conversation = conversations.data.find((item) => item.id === conversationId)
  if (!conversation) {
    const state: NoticeState = { notice: 'That conversation is not available.' }
    return <Navigate to={paths.workspace(workspaceId)} replace state={state} />
  }

  const title = conversationTitle(conversation, actor.userId)
  const others = otherParticipants(conversation, actor.userId)
  const direct = conversation.type === 'DIRECT' ? others[0] : undefined
  const presence = direct ? members.data?.find((member) => member.id === direct.id) : undefined

  const header = (
    <header className="flex h-(--topbar-height) shrink-0 items-center gap-2 border-b px-4">
      {direct ? (
        <span className="relative">
          <Avatar name={direct.name} src={direct.avatarUrl} className="size-7" />
          {presence && (
            <PresenceDot
              online={presence.online}
              className="absolute -right-0.5 -bottom-0.5 border-background"
            />
          )}
        </span>
      ) : (
        <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0">
        <h1 className="truncate leading-tight font-semibold">{title}</h1>
        {presence ? (
          <p className="text-xs text-muted-foreground">
            {presence.online
              ? 'Active now'
              : presence.lastSeenAt
                ? `Last seen ${formatRelative(presence.lastSeenAt)}`
                : 'Offline'}
          </p>
        ) : (
          conversation.type === 'GROUP' && (
            <p className="text-xs text-muted-foreground">
              {conversation.participants.length} people
            </p>
          )
        )}
      </div>
    </header>
  )

  return (
    <ChatView
      workspaceId={workspaceId}
      destination={destination}
      policy={conversationPolicy(conversation)}
      actor={actor}
      lastReadAt={conversation.lastReadAt}
      header={header}
      banner={<RouteNotice />}
      placeholder={`Message ${title}`}
      emptyState={
        <div className="px-4 pt-10 pb-4">
          <p className="text-lg font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">
            {direct
              ? `This is the beginning of your direct messages with ${direct.name}. Only the two of you can see them.`
              : 'This is the beginning of the group conversation. Only participants can see it.'}
          </p>
        </div>
      }
    />
  )
}
