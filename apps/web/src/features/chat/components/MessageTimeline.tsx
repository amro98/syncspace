import type { Destination, MessageDestination, WorkspaceActor } from '@syncspace/shared'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react'
import {
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
import { TimelineSkeleton } from './TimelineSkeleton'

const GROUP_WINDOW_MS = 5 * 60_000
const BOTTOM_SLACK_PX = 80
const LOAD_OLDER_WITHIN_PX = 400

type Row =
  | { key: string; kind: 'start'; loading: boolean; complete: boolean }
  | { key: string; kind: 'day'; label: string }
  | { key: string; kind: 'divider' }
  | { key: string; kind: 'message'; message: TimelineMessage; compact: boolean }

function isCompact(previous: TimelineMessage | undefined, message: TimelineMessage) {
  return (
    previous?.author.id === message.author.id &&
    !previous.deletedAt &&
    isSameDay(previous.createdAt, message.createdAt) &&
    new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_WINDOW_MS
  )
}

/** Flattens messages into the virtual list: day separators, the unread divider, messages. */
function buildRows(
  messages: TimelineMessage[],
  firstUnread: string | null,
  hasOlder: boolean,
  loadingOlder: boolean,
): Row[] {
  const rows: Row[] = [{ key: 'start', kind: 'start', loading: loadingOlder, complete: !hasOlder }]
  messages.forEach((message, index) => {
    const previous = messages[index - 1]
    const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt)
    if (newDay)
      rows.push({
        key: `day:${message.createdAt.slice(0, 10)}`,
        kind: 'day',
        label: formatDayLabel(message.createdAt),
      })
    const unreadHere = message.id === firstUnread
    if (unreadHere) rows.push({ key: 'divider', kind: 'divider' })
    rows.push({
      // Optimistic rows keep their key when confirmed, so they are not re-mounted.
      key: message.clientMessageId ?? message.id,
      kind: 'message',
      message,
      compact: !newDay && !unreadHere && isCompact(previous, message),
    })
  })
  return rows
}

/** Size guesses before measurement (real heights are measured as rows render). */
function estimateRow(row: Row | undefined): number {
  if (!row) return 40
  if (row.kind !== 'message') return 36
  const base = row.compact ? 26 : 56
  return (
    base +
    (row.message.attachments.length > 0 ? 176 : 0) +
    (row.message.reactions.length > 0 ? 28 : 0)
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
 * The message list of one destination, VIRTUALIZED: only the rows near the
 * viewport are in the DOM, so channels with thousands of messages stay fast.
 *
 * - Variable heights are measured as rows render (thumbnails have a fixed box,
 *   so images loading never shift the list).
 * - `anchorTo: 'end'` keeps the visible message in place when older pages are
 *   prepended; new messages are followed only while the viewer is at the end
 *   (or just sent one).
 *
 * Mount it with `key={destinationKey}` so per-destination state (divider
 * snapshot, scroll) resets on navigation.
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
  const [atBottom, setAtBottom] = useState(true)
  const [dividerVisible, setDividerVisible] = useState(true)
  // Snapshot at open: the divider stays put while messages are being read.
  const [dividerSince] = useState(lastReadAt)
  const firstUnread = useMemo(
    () => firstUnreadId(messages, dividerSince, actor.userId),
    [messages, dividerSince, actor.userId],
  )
  const rows = useMemo(
    () => buildRows(messages, firstUnread, query.hasNextPage, query.isFetchingNextPage),
    [messages, firstUnread, query.hasNextPage, query.isFetchingNextPage],
  )
  const dividerIndex = rows.findIndex((row) => row.kind === 'divider')

  // React Compiler skips this component (virtualizer methods are read during render); expected.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateRow(rows[index]),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 8,
    anchorTo: 'end',
    followOnAppend: true,
    scrollEndThreshold: BOTTOM_SLACK_PX,
  })

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
  }, [virtualizer, rows.length])

  const jumpToUnread = useCallback(() => {
    if (dividerIndex >= 0) virtualizer.scrollToIndex(dividerIndex, { align: 'center' })
  }, [virtualizer, dividerIndex])

  // Initial position: the unread divider if there is one, otherwise the newest message.
  const positioned = useRef(false)
  useLayoutEffect(() => {
    if (positioned.current || messages.length === 0) return
    positioned.current = true
    if (dividerIndex >= 0) virtualizer.scrollToIndex(dividerIndex, { align: 'center' })
    else virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
  }, [messages.length, dividerIndex, rows.length, virtualizer])

  // The viewer's own message always comes into view, even when scrolled up.
  const last = messages.at(-1)
  const lastOwnSendingKey =
    last?.author.id === actor.userId && last.status === 'sending' ? last.clientMessageId : undefined
  useEffect(() => {
    if (lastOwnSendingKey) scrollToBottom()
  }, [lastOwnSendingKey, scrollToBottom])

  const loadOlder = useCallback(() => {
    if (!query.hasNextPage || query.isFetchingNextPage || query.isFetchNextPageError) return
    void query.fetchNextPage()
  }, [query])

  const updateViewState = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < BOTTOM_SLACK_PX)
    if (dividerIndex >= 0) {
      const items = virtualizer.getVirtualItems()
      const top = element.scrollTop
      const bottom = top + element.clientHeight
      const divider = items.find((item) => item.index === dividerIndex)
      setDividerVisible(divider !== undefined && divider.end >= top && divider.start <= bottom)
    }
    if (positioned.current && element.scrollTop < LOAD_OLDER_WITHIN_PX) loadOlder()
  }, [dividerIndex, virtualizer, loadOlder])

  // A short history that does not fill the viewport cannot be scrolled up: keep loading.
  const totalSize = virtualizer.getTotalSize()
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !positioned.current) return
    if (element.scrollHeight <= element.clientHeight) loadOlder()
  }, [totalSize, loadOlder])

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

  // A failed OLDER page keeps the timeline (inline retry row); only a failed first load replaces it.
  const olderFailed = query.isFetchNextPageError
  const retryOlder = () => {
    void query.fetchNextPage()
  }

  if (query.isPending) return <TimelineSkeleton />
  if (query.isError && !olderFailed) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm"
        role="alert"
      >
        <p className="text-danger">{errorMessage(query.error)}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void query.refetch()
          }}
        >
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    )
  }

  const renderRow = (row: Row) => {
    switch (row.kind) {
      case 'start':
        return row.loading ? (
          <div className="flex justify-center py-3 text-muted-foreground">
            <Spinner label="Loading older messages" />
          </div>
        ) : olderFailed ? (
          <div
            className="flex items-center justify-center gap-2 py-3 text-xs text-danger"
            role="alert"
          >
            Couldn’t load older messages.
            <Button size="sm" variant="ghost" onClick={retryOlder}>
              Retry
            </Button>
          </div>
        ) : row.complete && messages.length > 0 ? (
          <p className="px-4 pt-6 pb-2 text-xs text-muted-foreground">
            This is the beginning of the conversation.
          </p>
        ) : (
          <div className="h-2" />
        )
      case 'day':
        return (
          <div className="flex justify-center py-2" role="separator" aria-label={row.label}>
            <span className="rounded-full border bg-background px-3 py-0.5 text-xs font-medium text-muted-foreground">
              {row.label}
            </span>
          </div>
        )
      case 'divider':
        return (
          <div
            className="flex items-center gap-2 px-4 py-1"
            role="separator"
            aria-label="New messages"
          >
            <span className="h-px flex-1 bg-danger/60" />
            <span className="text-xs font-semibold text-danger">New messages</span>
            <span className="h-px flex-1 bg-danger/60" />
          </div>
        )
      case 'message':
        return (
          <MessageItem
            message={row.message}
            actor={actor}
            policy={policy}
            compact={row.compact}
            onOpenThread={onOpenThread}
            onRetry={onRetry}
            onDiscard={onDiscard}
          />
        )
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={updateViewState}
        data-virtual-scroller=""
        className="relative min-h-0 flex-1 overflow-y-auto pb-2 [overflow-anchor:none]"
        role="log"
        aria-label="Messages"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 ? (
          emptyState
        ) : (
          <div className="relative w-full" style={{ height: `${String(totalSize)}px` }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]
              if (!row) return null
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${String(item.start)}px)` }}
                >
                  {renderRow(row)}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
        {dividerIndex >= 0 && !dividerVisible && (
          <Button
            size="sm"
            variant="outline"
            className="pointer-events-auto shadow-md"
            onClick={jumpToUnread}
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
