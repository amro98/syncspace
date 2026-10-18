/**
 * Centralised TanStack Query key factory. Every query key in the app comes
 * from here — never write raw key arrays in components or hooks.
 *
 * Keys are hierarchical so related data can be invalidated by prefix:
 *
 *   queryKeys.workspaces.detail(id)            ['workspaces', id]
 *   queryKeys.channels.list(workspaceId)       ['workspaces', id, 'channels']
 *   queryKeys.members.list(workspaceId)        ['workspaces', id, 'members']
 *
 * Invalidating `queryKeys.workspaces.detail(id)` therefore refreshes everything
 * scoped to that workspace (e.g. on a `workspace:updated` socket event or when
 * the user leaves it).
 *
 * Message and thread keys are scoped by their channel/conversation id (which
 * is globally unique) so realtime handlers can target them directly.
 */

type FilterValue = string | number | boolean | null | undefined

/** Serializable filter/pagination params that become part of a key. */
export type QueryFilters = Readonly<Record<string, FilterValue>>

const NO_FILTERS: QueryFilters = {}

export const queryKeys = {
  health: () => ['health'] as const,

  auth: {
    session: () => ['auth', 'session'] as const,
  },

  workspaces: {
    all: () => ['workspaces'] as const,
    list: () => [...queryKeys.workspaces.all(), 'list'] as const,
    detail: (workspaceId: string) => [...queryKeys.workspaces.all(), workspaceId] as const,
  },

  members: {
    list: (workspaceId: string) =>
      [...queryKeys.workspaces.detail(workspaceId), 'members'] as const,
  },

  channels: {
    list: (workspaceId: string) =>
      [...queryKeys.workspaces.detail(workspaceId), 'channels'] as const,
    detail: (workspaceId: string, channelId: string) =>
      [...queryKeys.channels.list(workspaceId), channelId] as const,
  },

  conversations: {
    list: (workspaceId: string) =>
      [...queryKeys.workspaces.detail(workspaceId), 'conversations'] as const,
    detail: (workspaceId: string, conversationId: string) =>
      [...queryKeys.conversations.list(workspaceId), conversationId] as const,
  },

  messages: {
    all: () => ['messages'] as const,
    channel: (channelId: string, filters: QueryFilters = NO_FILTERS) =>
      [...queryKeys.messages.all(), 'channel', channelId, filters] as const,
    conversation: (conversationId: string, filters: QueryFilters = NO_FILTERS) =>
      [...queryKeys.messages.all(), 'conversation', conversationId, filters] as const,
    thread: (parentMessageId: string) =>
      [...queryKeys.messages.all(), 'thread', parentMessageId] as const,
  },

  boards: {
    list: (workspaceId: string) => [...queryKeys.workspaces.detail(workspaceId), 'boards'] as const,
    detail: (workspaceId: string, boardId: string) =>
      [...queryKeys.boards.list(workspaceId), boardId] as const,
  },

  tasks: {
    list: (workspaceId: string, boardId: string, filters: QueryFilters = NO_FILTERS) =>
      [...queryKeys.boards.detail(workspaceId, boardId), 'tasks', filters] as const,
    detail: (workspaceId: string, taskId: string) =>
      [...queryKeys.workspaces.detail(workspaceId), 'task', taskId] as const,
  },

  notifications: {
    all: () => ['notifications'] as const,
    list: (filters: QueryFilters = NO_FILTERS) =>
      [...queryKeys.notifications.all(), 'list', filters] as const,
    unreadCount: () => [...queryKeys.notifications.all(), 'unread-count'] as const,
  },

  search: (workspaceId: string, query: string, filters: QueryFilters = NO_FILTERS) =>
    [...queryKeys.workspaces.detail(workspaceId), 'search', query, filters] as const,
} as const
