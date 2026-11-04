import type { NotificationLink } from '@syncspace/shared'

import { paths } from '@/app/router/paths'

/** Where clicking a notification goes (null: the target no longer exists). */
export function notificationPath(link: NotificationLink | null): string | null {
  if (!link) return null
  switch (link.kind) {
    case 'task':
      return paths.board(link.workspaceId, link.boardId, { task: link.taskId })
    case 'message': {
      const base =
        link.destination.kind === 'channel'
          ? paths.channel(link.workspaceId, link.destination.id)
          : paths.dm(link.workspaceId, link.destination.id)
      return `${base}?thread=${encodeURIComponent(link.threadId)}`
    }
    case 'destination':
      return link.destination.kind === 'channel'
        ? paths.channel(link.workspaceId, link.destination.id)
        : paths.dm(link.workspaceId, link.destination.id)
    case 'workspace':
      return paths.workspace(link.workspaceId)
  }
}
