import type { Destination, MessageDestination, WorkspaceActor } from '@syncspace/shared'
import { ArrowDown, ArrowUp } from 'lucide-react'
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Spinner } from '@/components/shared/Spinner'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/features/auth/messages'
import { formatDayLabel, isSameDay } from '@/lib/format'
import { useChatStore } from '@/stores/chat-store'

import { destinationKey, firstUnreadId, flattenTimeline, type TimelineMessage } from '../cache'
import { useMarkRead, useMessages } from '../hooks'
import { MessageItem } from './MessageItem'

const GROUP_WINDOW_MS = 5 * 60_000
const BOTTOM_SLACK_PX = 80

function isCompact(previous: TimelineMessage | undefined, message: TimelineMessage) {
  return (
    previous?.author.id === message.author.id &&
    !previous.deletedAt &&
    isSameDay(previous.createdAt, message.createdAt) &&
    new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_WINDOW_MS
  )
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const onChange = () => {
      setVisible(document.visibilityState !== 'hidden')
    }
    document.addEventListener('visibilitychange', onChange)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
    }
  }, [])
  return visible
}

/**
 * The scrolling message list of one destination. Mount it with
 * `key={destinationKey}` so per-destination state (divider snapshot, scroll)
 * resets on navigation.
 */
export function MessageTimeline({
  workspaceId,
  destination,
  policy,
  actor,
  lastReadAt,
  emptyState,
  onOpenThread,
  onRetry,
  onDiscard,
}: {
  workspaceId: string
  destination: Destination
  policy: MessageDestination
  actor: WorkspaceActor
  /** Read position when the destination was opened (divider placement). */
  lastReadAt: string | null
  emptyState: ReactNode
  onOpenThread: (messageId: string) => void
  onRetry: (message: TimelineMessage) => void
  onDiscard: (message: TimelineMessage) => void
}) {
  const query = useMessages(workspaceId, destination)
  const messages = useMemo(() => flattenTimeline(query.data), [query.data])
  const markRead = useMarkRead(workspaceId, destination)
  const setReadingKey = useChatStore((state) => state.setReadingKey)
  const pageVisible = usePageVisible()

  const scrollRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [dividerVisible, setDividerVisible] = useState(true)
  // Snapshot at open: the divider stays put while messages are being read.
  const [dividerSince] = useState(lastReadAt)
  const firstUnread = useMemo(
    () => firstUnreadId(messages, dividerSince, actor.userId),
    [messages, dividerSince, actor.userId],
  )

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [])

  // Initial position: the unread divider if there is one, otherwise the newest message.
  const positioned = useRef(false)
  useLayoutEffect(() => {
    if (positioned.current || messages.length === 0) return
    positioned.current = true
    if (firstUnread && dividerRef.current) dividerRef.current.scrollIntoView({ block: 'center' })
    else scrollToBottom()
  }, [messages.length, firstUnread, scrollToBottom])

  // Keep scroll position stable when older pages are prepended.
  const pageCount = query.data?.pages.length ?? 0
  const anchor = useRef<{ pages: number; height: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const element = scrollRef.current
    const saved = anchor.current
    if (element && saved && pageCount > saved.pages) {
      element.scrollTop = element.scrollHeight - saved.height + saved.top
      anchor.current = null
    }
  }, [pageCount])

  // Follow new messages when already at the bottom, or when the viewer just sent one.
  const lastMessage = messages.at(-1)
  const lastId = lastMessage?.id
  useLayoutEffect(() => {
    if (!positioned.current || !lastMessage) return
    if (atBottom || (lastMessage.author.id === actor.userId && lastMessage.status === 'sending')) {
      scrollToBottom()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the newest message changes
  }, [lastId])

  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < BOTTOM_SLACK_PX
    setAtBottom(bottom)
    if (dividerRef.current) {
      const box = dividerRef.current.getBoundingClientRect()
      const view = element.getBoundingClientRect()
      setDividerVisible(box.bottom >= view.top && box.top <= view.bottom)
    }
    if (element.scrollTop < 200) loadOlder()
  }

  const loadOlder = () => {
    if (!query.hasNextPage || query.isFetchingNextPage || !scrollRef.current) return
    const element = scrollRef.current
    anchor.current = { pages: pageCount, height: element.scrollHeight, top: element.scrollTop }
    void query.fetchNextPage()
  }

  // Load older pages when the top sentinel scrolls into view (also covers short timelines).
  useEffect(() => {
    const target = topRef.current
    if (!target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && positioned.current) loadOlder()
    })
    observer.observe(target)
    return () => {
      observer.disconnect()
    }
  })

  // Reading = latest content on screen in a visible tab: mark read and suppress unread bumps.
  const latestConfirmed = useMemo(
    () => [...messages].reverse().find((message) => !message.status),
    [messages],
  )
  const reading = atBottom && pageVisible
  const key = destinationKey(destination)
  useEffect(() => {
    setReadingKey(reading ? key : null)
    return () => {
      setReadingKey(null)
    }
  }, [reading, key, setReadingKey])
  useEffect(() => {
    if (reading && latestConfirmed) markRead(latestConfirmed)
  }, [reading, latestConfirmed, markRead])

  if (query.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner label="Loading messages" />
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-danger" role="alert">
        {errorMessage(query.error)}
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto pb-2 [overflow-anchor:none]"
        role="log"
        aria-label="Messages"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div ref={topRef} aria-hidden className="h-px" />
        {query.isFetchingNextPage && (
          <div className="flex justify-center py-2 text-muted-foreground">
            <Spinner label="Loading older messages" />
          </div>
        )}
        {!query.hasNextPage && messages.length > 0 && (
          <p className="px-4 pt-6 pb-2 text-xs text-muted-foreground">
            This is the beginning of the conversation.
          </p>
        )}
        {messages.length === 0 && emptyState}

        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt)
          const unreadHere = message.id === firstUnread
          return (
            <Fragment key={message.clientMessageId ?? message.id}>
              {newDay && (
                <div className="sticky top-0 z-10 flex justify-center py-2" role="separator">
                  <span className="rounded-full border bg-background px-3 py-0.5 text-xs font-medium text-muted-foreground">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              {unreadHere && (
                <div
                  ref={dividerRef}
                  className="flex items-center gap-2 px-4 py-1"
                  role="separator"
                >
                  <span className="h-px flex-1 bg-danger/60" />
                  <span className="text-xs font-semibold text-danger">New messages</span>
                  <span className="h-px flex-1 bg-danger/60" />
                </div>
              )}
              <MessageItem
                message={message}
                actor={actor}
                policy={policy}
                compact={!newDay && !unreadHere && isCompact(previous, message)}
                onOpenThread={onOpenThread}
                onRetry={onRetry}
                onDiscard={onDiscard}
              />
            </Fragment>
          )
        })}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
        {firstUnread && !dividerVisible && (
          <Button
            size="sm"
            variant="outline"
            className="pointer-events-auto shadow-md"
            onClick={() =>
              dividerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
            }
          >
            <ArrowUp aria-hidden /> Jump to unread
          </Button>
        )}
      </div>
      {!atBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            size="sm"
            variant="outline"
            className="pointer-events-auto shadow-md"
            onClick={scrollToBottom}
          >
            <ArrowDown aria-hidden /> Jump to newest
          </Button>
        </div>
      )}
    </div>
  )
}
