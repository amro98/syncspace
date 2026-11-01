import { isWorkspaceAdmin, type SearchResult } from '@syncspace/shared'

import type { Prisma } from '@/generated/prisma/client'
import { getPrisma } from '@/lib/prisma'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'

import { messageDestination, publicUserSelect, toPublicUser } from './presenters'

const SNIPPET_RADIUS = 60

/** Plain-text excerpt around the first case-insensitive match. */
export function makeSnippet(content: string, query: string): string {
  const index = content.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return content.slice(0, SNIPPET_RADIUS * 2)
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(content.length, index + query.length + SNIPPET_RADIUS)
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`
}

/**
 * Case-insensitive substring search (PostgreSQL ILIKE) over messages the
 * viewer can read: public channels, private channels they belong to (or all
 * private channels for OWNER/ADMIN oversight), and their own conversations.
 * Access rules live in the WHERE clause, so nothing inaccessible is ever read.
 */
export async function searchMessages(
  workspace: WorkspaceAccess,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const { actor, workspaceId } = workspace
  const channelMessages: Prisma.MessageWhereInput = isWorkspaceAdmin(actor)
    ? { channelId: { not: null } }
    : {
        channel: {
          is: { OR: [{ type: 'PUBLIC' }, { members: { some: { userId: actor.userId } } }] },
        },
      }

  const rows = await getPrisma().message.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      content: { contains: query, mode: 'insensitive' },
      OR: [
        channelMessages,
        { conversation: { is: { participants: { some: { userId: actor.userId } } } } },
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      channelId: true,
      conversationId: true,
      parentMessageId: true,
      content: true,
      createdAt: true,
      author: { select: publicUserSelect },
      channel: { select: { name: true } },
      conversation: {
        select: {
          type: true,
          name: true,
          participants: { select: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  })

  return rows.map((row) => {
    const destination = messageDestination(row)
    let name = row.channel?.name ?? ''
    if (row.conversation) {
      const others = row.conversation.participants
        .map((participant) => participant.user)
        .filter((user) => user.id !== actor.userId)
      name = row.conversation.name ?? (others.map((user) => user.name).join(', ') || 'You')
    }
    return {
      messageId: row.id,
      parentMessageId: row.parentMessageId,
      destination: { ...destination, name },
      author: toPublicUser(row.author),
      createdAt: row.createdAt.toISOString(),
      snippet: makeSnippet(row.content, query),
    }
  })
}
