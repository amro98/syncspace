import {
  addChannelMemberInputSchema,
  type Channel,
  type ChannelListResponse,
  type ChannelMemberListResponse,
  type ChannelSummary,
  type ConversationListResponse,
  type ConversationSummary,
  createChannelInputSchema,
  createDirectConversationInputSchema,
  createGroupConversationInputSchema,
  editMessageInputSchema,
  idSchema,
  markReadInputSchema,
  memberSearchQuerySchema,
  type Message,
  messagePageQuerySchema,
  type MessagePage,
  type ReadCursor,
  type SearchResultsResponse,
  searchMessagesQuerySchema,
  sendMessageInputSchema,
  threadQuerySchema,
  type ThreadResponse,
  toggleReactionInputSchema,
  updateChannelInputSchema,
  type WorkspaceMemberListResponse,
} from '@syncspace/shared'
import { type Request, Router } from 'express'

import { requireAuth } from '@/middleware/require-auth'
import { validate } from '@/middleware/validate'
import { getWorkspaceAccess } from '@/modules/workspaces/workspace-access'

import {
  addChannelMember,
  createChannel,
  listChannelMembers,
  listChannels,
  removeChannelMember,
  setChannelArchived,
  updateChannel,
} from './channels.service'
import {
  createGroupConversation,
  listConversations,
  openDirectConversation,
} from './conversations.service'
import { loadChannel, loadConversation, type DestinationAccess } from './destinations'
import { listWorkspaceMembers } from './members.service'
import {
  deleteMessage,
  editMessage,
  listMessages,
  listReplies,
  replyToMessage,
  sendMessage,
  toggleReaction,
} from './messages.service'
import { markRead } from './read-state.service'
import { searchMessages } from './search.service'

/** The parts of a request the helpers read (any validated query/body shape is fine). */
type RouteRequest = Pick<Request, 'params' | 'auth' | 'workspaceAccess'>

/** Reads a UUID route param (validation error for anything else). */
function param(req: RouteRequest, name: string): string {
  return idSchema.parse((req.params as Record<string, unknown>)[name])
}

function channelAccess(req: RouteRequest) {
  return loadChannel(getWorkspaceAccess(req), param(req, 'channelId'))
}

function conversationAccess(req: RouteRequest) {
  return loadConversation(getWorkspaceAccess(req), param(req, 'conversationId'))
}

// ---------------------------------------------------------------------------
// /workspaces/:workspaceId/* (mounted behind requireWorkspaceMember)
// ---------------------------------------------------------------------------

export const chatWorkspaceRouter = Router({ mergeParams: true })

chatWorkspaceRouter.get(
  '/members',
  validate({ query: memberSearchQuerySchema }),
  async (req, res) => {
    const body: WorkspaceMemberListResponse = {
      items: await listWorkspaceMembers(getWorkspaceAccess(req), req.query.q),
    }
    res.json(body)
  },
)

// Channels -------------------------------------------------------------------

chatWorkspaceRouter.get('/channels', async (req, res) => {
  const body: ChannelListResponse = { items: await listChannels(getWorkspaceAccess(req)) }
  res.json(body)
})

chatWorkspaceRouter.post(
  '/channels',
  validate({ body: createChannelInputSchema }),
  async (req, res) => {
    const body: ChannelSummary = await createChannel(getWorkspaceAccess(req), req.body)
    res.status(201).json(body)
  },
)

chatWorkspaceRouter.patch(
  '/channels/:channelId',
  validate({ body: updateChannelInputSchema }),
  async (req, res) => {
    const body: Channel = await updateChannel(
      getWorkspaceAccess(req),
      param(req, 'channelId'),
      req.body,
    )
    res.json(body)
  },
)

chatWorkspaceRouter.post('/channels/:channelId/archive', async (req, res) => {
  const body: Channel = await setChannelArchived(
    getWorkspaceAccess(req),
    param(req, 'channelId'),
    true,
  )
  res.json(body)
})

chatWorkspaceRouter.post('/channels/:channelId/unarchive', async (req, res) => {
  const body: Channel = await setChannelArchived(
    getWorkspaceAccess(req),
    param(req, 'channelId'),
    false,
  )
  res.json(body)
})

chatWorkspaceRouter.get('/channels/:channelId/members', async (req, res) => {
  const body: ChannelMemberListResponse = {
    items: await listChannelMembers(getWorkspaceAccess(req), param(req, 'channelId')),
  }
  res.json(body)
})

chatWorkspaceRouter.post(
  '/channels/:channelId/members',
  validate({ body: addChannelMemberInputSchema }),
  async (req, res) => {
    const body: ChannelMemberListResponse = {
      items: await addChannelMember(
        getWorkspaceAccess(req),
        param(req, 'channelId'),
        req.body.userId,
      ),
    }
    res.status(201).json(body)
  },
)

chatWorkspaceRouter.delete('/channels/:channelId/members/:userId', async (req, res) => {
  await removeChannelMember(getWorkspaceAccess(req), param(req, 'channelId'), param(req, 'userId'))
  res.status(204).end()
})

// Conversations ----------------------------------------------------------------

chatWorkspaceRouter.get('/conversations', async (req, res) => {
  const body: ConversationListResponse = { items: await listConversations(getWorkspaceAccess(req)) }
  res.json(body)
})

chatWorkspaceRouter.post(
  '/conversations/direct',
  validate({ body: createDirectConversationInputSchema }),
  async (req, res) => {
    const { conversation, created } = await openDirectConversation(
      getWorkspaceAccess(req),
      req.body.targetUserId,
    )
    const body: ConversationSummary = conversation
    res.status(created ? 201 : 200).json(body)
  },
)

chatWorkspaceRouter.post(
  '/conversations/group',
  validate({ body: createGroupConversationInputSchema }),
  async (req, res) => {
    const body: ConversationSummary = await createGroupConversation(
      getWorkspaceAccess(req),
      req.body,
    )
    res.status(201).json(body)
  },
)

// Messages & read state for both destination kinds -------------------------------

for (const [segment, load] of [
  ['channels/:channelId', channelAccess],
  ['conversations/:conversationId', conversationAccess],
] as const satisfies readonly (readonly [
  string,
  (req: RouteRequest) => Promise<DestinationAccess>,
])[]) {
  chatWorkspaceRouter.get(
    `/${segment}/messages`,
    validate({ query: messagePageQuerySchema }),
    async (req, res) => {
      const body: MessagePage = await listMessages(await load(req), req.query)
      res.json(body)
    },
  )

  chatWorkspaceRouter.post(
    `/${segment}/messages`,
    validate({ body: sendMessageInputSchema }),
    async (req, res) => {
      const body: Message = await sendMessage(await load(req), req.body)
      res.status(201).json(body)
    },
  )

  chatWorkspaceRouter.post(
    `/${segment}/read`,
    validate({ body: markReadInputSchema }),
    async (req, res) => {
      const body: ReadCursor = await markRead(await load(req), req.body.messageId)
      res.json(body)
    },
  )
}

// Search ------------------------------------------------------------------------

chatWorkspaceRouter.get(
  '/search/messages',
  validate({ query: searchMessagesQuerySchema }),
  async (req, res) => {
    const body: SearchResultsResponse = {
      items: await searchMessages(getWorkspaceAccess(req), req.query.q, req.query.limit),
    }
    res.json(body)
  },
)

// ---------------------------------------------------------------------------
// /messages/:messageId — access is resolved from the message itself.
// ---------------------------------------------------------------------------

export const messagesRouter = Router()
messagesRouter.use(requireAuth)

const userId = (req: RouteRequest) => req.auth?.userId ?? ''

messagesRouter.patch(
  '/:messageId',
  validate({ body: editMessageInputSchema }),
  async (req, res) => {
    const body: Message = await editMessage(userId(req), param(req, 'messageId'), req.body.content)
    res.json(body)
  },
)

messagesRouter.delete('/:messageId', async (req, res) => {
  const body: Message = await deleteMessage(userId(req), param(req, 'messageId'))
  res.json(body)
})

messagesRouter.get(
  '/:messageId/replies',
  validate({ query: threadQuerySchema }),
  async (req, res) => {
    const body: ThreadResponse = await listReplies(userId(req), param(req, 'messageId'), req.query)
    res.json(body)
  },
)

messagesRouter.post(
  '/:messageId/replies',
  validate({ body: sendMessageInputSchema }),
  async (req, res) => {
    const body: Message = await replyToMessage(userId(req), param(req, 'messageId'), req.body)
    res.status(201).json(body)
  },
)

messagesRouter.post(
  '/:messageId/reactions',
  validate({ body: toggleReactionInputSchema }),
  async (req, res) => {
    res.json(await toggleReaction(userId(req), param(req, 'messageId'), req.body.emoji))
  },
)
