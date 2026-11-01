import type {
  ChannelSummary,
  ConversationSummary,
  Message,
  WorkspaceMember,
} from '@syncspace/shared'

import { authUser, ids, type MockRoutes, signedInRoutes, workspaceDetail } from './render'

/** Deterministic UUIDv7-shaped ids for chat fixtures. */
export function uuid(n: number): string {
  return `01920000-7c00-7000-8000-${n.toString(16).padStart(12, '0')}`
}

export const chatIds = {
  general: uuid(0xc1),
  random: uuid(0xc2),
  secret: uuid(0xc3),
  dm: uuid(0xd1),
}

export const ada = { id: ids.user, name: 'Ada Lovelace', avatarUrl: null }
export const grace = { id: ids.otherUser, name: 'Grace Hopper', avatarUrl: null }

export function channelSummary(overrides: Partial<ChannelSummary> = {}): ChannelSummary {
  return {
    id: chatIds.general,
    workspaceId: ids.workspace,
    name: 'general',
    slug: 'general',
    description: 'Company-wide announcements',
    type: 'PUBLIC',
    archivedAt: null,
    createdById: ids.user,
    memberCount: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    isMember: true,
    unreadCount: 0,
    lastReadAt: '2026-01-01T00:00:00.000Z',
    lastReadMessageId: null,
    ...overrides,
  }
}

export function conversationSummary(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id: chatIds.dm,
    workspaceId: ids.workspace,
    type: 'DIRECT',
    name: null,
    participants: [ada, grace],
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    unreadCount: 0,
    lastReadAt: '2026-01-01T00:00:00.000Z',
    lastReadMessageId: null,
    ...overrides,
  }
}

export function member(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    ...grace,
    email: 'grace@example.com',
    role: 'MEMBER',
    online: true,
    lastSeenAt: null,
    ...overrides,
  }
}

let sequence = 0x1000

export function message(overrides: Partial<Message> = {}): Message {
  sequence += 1
  return {
    id: uuid(sequence),
    workspaceId: ids.workspace,
    destination: { kind: 'channel', id: chatIds.general },
    parentMessageId: null,
    author: grace,
    content: 'Hello there',
    createdAt: '2026-03-02T10:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    reactions: [],
    replyCount: 0,
    attachments: [],
    ...overrides,
  }
}

const base = `/workspaces/${ids.workspace}`

/** A signed-in workspace with chat data. */
export function chatRoutes(
  options: {
    channels?: ChannelSummary[]
    conversations?: ConversationSummary[]
    members?: WorkspaceMember[]
    messages?: Record<string, Message[]>
    role?: 'OWNER' | 'ADMIN' | 'MEMBER'
  } = {},
): MockRoutes {
  const channels = options.channels ?? [channelSummary()]
  const routes: MockRoutes = {
    ...signedInRoutes({
      user: authUser(),
      workspaces: [workspaceDetail({ role: options.role ?? 'OWNER' })],
    }),
    [`GET ${base}/channels`]: { body: { items: channels } },
    [`GET ${base}/conversations`]: { body: { items: options.conversations ?? [] } },
    [`GET ${base}/members`]: {
      body: {
        items: options.members ?? [
          member({ ...ada, email: 'ada@example.com', role: 'OWNER' }),
          member(),
        ],
      },
    },
  }
  for (const channel of channels) {
    routes[`GET ${base}/channels/${channel.id}/messages`] = {
      body: { items: options.messages?.[channel.id] ?? [], nextCursor: null },
    }
    routes[`POST ${base}/channels/${channel.id}/read`] = ({ body }) => ({
      body: {
        lastReadAt: '2026-03-02T12:00:00.000Z',
        lastReadMessageId: (body as { messageId: string }).messageId,
      },
    })
  }
  for (const conversation of options.conversations ?? []) {
    routes[`GET ${base}/conversations/${conversation.id}/messages`] = {
      body: { items: options.messages?.[conversation.id] ?? [], nextCursor: null },
    }
    routes[`POST ${base}/conversations/${conversation.id}/read`] = ({ body }) => ({
      body: {
        lastReadAt: '2026-03-02T12:00:00.000Z',
        lastReadMessageId: (body as { messageId: string }).messageId,
      },
    })
  }
  return routes
}

export const chatBase = base
export const channelPath = (channelId: string) =>
  `/app/workspaces/${ids.workspace}/channel/${channelId}`
export const dmPath = (conversationId: string) =>
  `/app/workspaces/${ids.workspace}/dm/${conversationId}`
