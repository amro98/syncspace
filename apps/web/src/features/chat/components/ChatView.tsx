import type { Destination, MessageDestination, WorkspaceActor } from '@syncspace/shared'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { queryKeys } from '@/lib/query-keys'

import { removeOptimistic, type TimelineData, type TimelineMessage } from '../cache'
import { destinationKey, useSendMessage, useWorkspaceMembers } from '../hooks'
import { postingBlockedReason } from '../policy'
import { useDestinationRoom } from '../realtime'
import { Composer } from './Composer'
import { MessageTimeline } from './MessageTimeline'
import { ThreadPanel } from './ThreadPanel'
import { TypingIndicator } from './TypingIndicator'

/**
 * The main conversation area shared by channels and DMs:
 * header · timeline · typing indicator · composer, plus the thread panel.
 */
export function ChatView({
  workspaceId,
  destination,
  policy,
  actor,
  lastReadAt,
  header,
  banner,
  placeholder,
  emptyState,
}: {
  workspaceId: string
  /** Must be referentially stable (memoize it). */
  destination: Destination
  policy: MessageDestination
  actor: WorkspaceActor
  lastReadAt: string | null
  header: ReactNode
  banner?: ReactNode
  placeholder: string
  emptyState: ReactNode
}) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const threadId = searchParams.get('thread')
  const members = useWorkspaceMembers(workspaceId)
  const { mutate: sendMessage } = useSendMessage(workspaceId, destination)
  const key = destinationKey(destination)

  useDestinationRoom(workspaceId, destination)

  const openThread = useCallback(
    (messageId: string) => {
      setSearchParams({ thread: messageId })
    },
    [setSearchParams],
  )
  const closeThread = useCallback(() => {
    setSearchParams({})
  }, [setSearchParams])

  const sendContent = useCallback(
    (content: string) => {
      sendMessage({ content, clientMessageId: crypto.randomUUID() })
    },
    [sendMessage],
  )
  const discard = useCallback(
    (message: TimelineMessage) => {
      if (!message.clientMessageId) return
      const clientMessageId = message.clientMessageId
      queryClient.setQueryData<TimelineData>(queryKeys.messages.destination(destination), (data) =>
        removeOptimistic(data, clientMessageId),
      )
    },
    [queryClient, destination],
  )
  const retry = useCallback(
    (message: TimelineMessage) => {
      discard(message)
      sendContent(message.content)
    },
    [discard, sendContent],
  )

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Conversation">
        {header}
        {banner}
        <MessageTimeline
          key={key}
          workspaceId={workspaceId}
          destination={destination}
          policy={policy}
          actor={actor}
          lastReadAt={lastReadAt}
          emptyState={emptyState}
          onOpenThread={openThread}
          onRetry={retry}
          onDiscard={discard}
        />
        <TypingIndicator typingKey={key} viewerId={actor.userId} members={members.data} />
        <Composer
          key={key}
          destination={destination}
          draftKey={key}
          placeholder={placeholder}
          disabledReason={postingBlockedReason(actor, policy)}
          onSend={sendContent}
          autoFocus
        />
      </section>
      {threadId && (
        <ThreadPanel
          key={threadId}
          parentId={threadId}
          destination={destination}
          policy={policy}
          actor={actor}
          onClose={closeThread}
        />
      )}
    </div>
  )
}
