import { SERVER_EVENTS, type ServerToClientEvents } from '@syncspace/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { queryKeys } from '@/lib/query-keys'
import { getSocket } from '@/lib/socket'

import { useInboxWriters } from './hooks'

type Handlers = { [E in keyof ServerToClientEvents]?: ServerToClientEvents[E] }

/**
 * Notifications arrive on the user's own room (`user:<id>`, joined on
 * connect), whichever workspace is open. Each event carries the unread count,
 * so the badge never needs a refetch.
 */
export function useNotificationsRealtime(): void {
  const queryClient = useQueryClient()
  const { added, changed, allRead } = useInboxWriters()

  useEffect(() => {
    const socket = getSocket()
    const handlers: Handlers = {
      [SERVER_EVENTS.NOTIFICATION_CREATED]: ({ notification, unreadCount }) => {
        added(notification, unreadCount)
      },
      [SERVER_EVENTS.NOTIFICATION_UPDATED]: ({ notification, unreadCount }) => {
        changed(notification, unreadCount)
      },
      [SERVER_EVENTS.NOTIFICATIONS_READ]: ({ readAt }) => {
        allRead(readAt)
      },
    }
    let connectedBefore = socket.connected
    const onConnect = () => {
      if (connectedBefore)
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() })
      connectedBefore = true
    }
    const entries = Object.entries(handlers) as [
      keyof ServerToClientEvents,
      (...args: never[]) => void,
    ][]
    for (const [event, handler] of entries) socket.on(event, handler as never)
    socket.on('connect', onConnect)
    return () => {
      for (const [event, handler] of entries) socket.off(event, handler as never)
      socket.off('connect', onConnect)
    }
  }, [queryClient, added, changed, allRead])
}
