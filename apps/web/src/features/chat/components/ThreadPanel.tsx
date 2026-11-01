import {
  canReplyToMessage,
  type Destination,
  type MessageDestination,
  type WorkspaceActor,
} from '@syncspace/shared'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Spinner } from '@/components/shared/Spinner'
import { errorMessage } from '@/features/auth/messages'

import { useSendReply, useThread } from '../hooks'
import { Composer } from './Composer'
import { MessageItem } from './MessageItem'

/**
 * One-level thread: the parent message, its replies and a reply composer.
 * A side panel on desktop, a full-screen layer on mobile. Opened by the
 * `?thread=<messageId>` search param, so threads are linkable.
 */
export function ThreadPanel({
  parentId,
  destination,
  policy,
  actor,
  onClose,
}: {
  parentId: string
  destination: Destination
  policy: MessageDestination
  actor: WorkspaceActor
  onClose: () => void
}) {
  const thread = useThread(parentId)
  const send = useSendReply(parentId)
  const listRef = useRef<HTMLDivElement>(null)
  const replyCount = thread.data?.items.length ?? 0

  // Keep the newest reply in view.
  useEffect(() => {
    const element = listRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [replyCount])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const parent = thread.data?.parent
  const replyBlocked =
    parent &&
    !canReplyToMessage(actor, {
      authorId: parent.author.id,
      isDeleted: parent.deletedAt !== null,
      isReply: false,
      destination: policy,
    })

  return (
    <aside
      aria-label="Thread"
      className="fixed inset-0 z-40 flex flex-col bg-background lg:static lg:z-auto lg:w-96 lg:shrink-0 lg:border-l"
    >
      <header className="flex h-(--topbar-height) shrink-0 items-center justify-between border-b px-4">
        <h2 className="font-semibold">Thread</h2>
        <button
          type="button"
          aria-label="Close thread"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      {thread.isPending ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Spinner label="Loading thread" />
        </div>
      ) : thread.isError ? (
        <p className="p-4 text-sm text-danger" role="alert">
          {thread.error.code === 'NOT_FOUND'
            ? 'This thread is no longer available.'
            : errorMessage(thread.error)}
        </p>
      ) : (
        <>
          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto py-2"
            role="log"
            aria-label="Replies"
          >
            <MessageItem
              message={thread.data.parent}
              actor={actor}
              policy={policy}
              compact={false}
              inThread
            />
            <div
              className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground"
              role="separator"
            >
              <span>
                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {thread.data.items.map((reply) => (
              <MessageItem
                key={reply.id}
                message={reply}
                actor={actor}
                policy={policy}
                compact={false}
                inThread
              />
            ))}
          </div>
          {send.error && (
            <p className="px-4 text-xs text-danger" role="alert">
              {errorMessage(send.error)}
            </p>
          )}
          <Composer
            destination={destination}
            draftKey={`thread:${parentId}`}
            placeholder="Reply…"
            disabledReason={
              replyBlocked
                ? thread.data.parent.deletedAt
                  ? 'The original message was deleted.'
                  : 'You cannot reply here.'
                : null
            }
            onSend={(content) => {
              send.mutate({ content, clientMessageId: crypto.randomUUID() })
            }}
          />
        </>
      )}
    </aside>
  )
}
