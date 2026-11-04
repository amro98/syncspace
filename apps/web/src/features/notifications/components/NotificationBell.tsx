import {
  LIMITS,
  type Notification,
  type NotificationFilter,
  type NotificationType,
} from '@syncspace/shared'
import {
  AtSign,
  Bell,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Mail,
  MailOpen,
  MessageSquare,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { memo, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/features/auth/messages'
import { formatCount, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

import { flattenInbox } from '../cache'
import { useMarkAllRead, useMarkNotification, useNotifications, useUnreadCount } from '../hooks'
import { notificationPath } from '../navigation'

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  TASK_ASSIGNED: ClipboardList,
  TASK_UPDATED: CheckCircle2,
  MESSAGE: MessageSquare,
  MENTION: AtSign,
  INVITE: UserPlus,
  SYSTEM: Bell,
}

function NotificationItemImpl({
  notification,
  onOpen,
  onToggleRead,
}: {
  notification: Notification
  onOpen: (notification: Notification) => void
  onToggleRead: (notification: Notification) => void
}) {
  const Icon = TYPE_ICON[notification.type]
  const unread = notification.readAt === null
  const gone = notification.link === null
  return (
    <li className={cn('group relative flex gap-3 px-3 py-2.5', unread && 'bg-primary/5')}>
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          unread ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <button
        type="button"
        onClick={() => {
          onOpen(notification)
        }}
        className="min-w-0 flex-1 text-left focus-visible:outline-none [&:focus-visible_.title]:underline"
      >
        <span className={cn('title block text-sm', unread ? 'font-semibold' : 'font-medium')}>
          {unread && <span className="sr-only">Unread: </span>}
          {notification.title}
        </span>
        {notification.body && (
          <span className="line-clamp-2 block text-sm text-muted-foreground">
            {notification.body}
          </span>
        )}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {notification.workspace?.name && `${notification.workspace.name} · `}
          <time dateTime={notification.createdAt}>{formatRelative(notification.createdAt)}</time>
          {gone && ' · no longer available'}
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-center gap-1">
        {unread && <span aria-hidden className="mt-1.5 size-2 rounded-full bg-primary" />}
        <button
          type="button"
          aria-label={unread ? 'Mark as read' : 'Mark as unread'}
          title={unread ? 'Mark as read' : 'Mark as unread'}
          onClick={() => {
            onToggleRead(notification)
          }}
          className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-sm:opacity-100"
        >
          {unread ? (
            <MailOpen className="size-3.5" aria-hidden />
          ) : (
            <Mail className="size-3.5" aria-hidden />
          )}
        </button>
      </div>
    </li>
  )
}

const NotificationItem = memo(NotificationItemImpl)

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const inbox = useNotifications(filter, true)
  const mark = useMarkNotification()
  const markAll = useMarkAllRead()
  const unread = useUnreadCount()
  const items = flattenInbox(inbox.data)
  const [goneNotice, setGoneNotice] = useState(false)

  const open = (notification: Notification) => {
    if (!notification.readAt) mark.mutate({ id: notification.id, read: true })
    const path = notificationPath(notification.link)
    if (!path) {
      setGoneNotice(true)
      return
    }
    onClose()
    void navigate(path)
  }
  const toggleRead = (notification: Notification) => {
    mark.mutate({ id: notification.id, read: notification.readAt === null })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="flex-1 font-semibold">Notifications</h2>
        <Button
          size="sm"
          variant="ghost"
          disabled={(unread.data ?? 0) === 0 || markAll.isPending}
          onClick={() => {
            markAll.mutate()
          }}
        >
          <CheckCheck aria-hidden />
          Mark all read
        </Button>
        <button
          type="button"
          aria-label="Close notifications"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:hidden"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="flex gap-1 border-b px-3 py-1.5" role="group" aria-label="Show">
        {(['all', 'unread'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value)
            }}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              filter === value
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {value === 'all' ? 'All' : 'Unread'}
          </button>
        ))}
      </div>
      {goneNotice && (
        <p role="status" className="border-b bg-muted px-3 py-2 text-xs">
          That item no longer exists or you no longer have access to it.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {inbox.isPending ? (
          <ListSkeleton rows={4} label="Loading notifications" className="gap-4 py-4" />
        ) : inbox.isError ? (
          <p role="alert" className="p-4 text-sm text-danger">
            {errorMessage(inbox.error)}
          </p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {filter === 'unread' ? 'You are all caught up.' : 'No notifications yet.'}
          </p>
        ) : (
          <ul className="divide-y" aria-label="Notifications">
            {items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onOpen={open}
                onToggleRead={toggleRead}
              />
            ))}
          </ul>
        )}
        {inbox.hasNextPage && (
          <div className="flex justify-center p-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={inbox.isFetchingNextPage}
              onClick={() => {
                void inbox.fetchNextPage()
              }}
            >
              {inbox.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Topbar bell: unread badge + inbox (popover on desktop, full-screen sheet on mobile). */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const unread = useUnreadCount()
  const count = unread.data ?? 0
  const containerRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `Notifications, ${String(count)} unread` : 'Notifications'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value)
        }}
        className="relative flex size-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Bell className="size-4" aria-hidden />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-semibold text-danger-foreground"
          >
            {formatCount(count, LIMITS.UNREAD_COUNT_CAP)}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-0 z-50 bg-popover text-popover-foreground sm:absolute sm:inset-auto sm:top-full sm:right-0 sm:mt-1 sm:h-[32rem] sm:w-96 sm:rounded-lg sm:border sm:shadow-lg"
        >
          <NotificationPanel
            onClose={() => {
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
