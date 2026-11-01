import type { z } from 'zod'

import type {
  attachmentSchema,
  channelListResponseSchema,
  channelMemberListResponseSchema,
  channelMemberSchema,
  channelSchema,
  channelSummarySchema,
  conversationListResponseSchema,
  conversationSchema,
  conversationSummarySchema,
  createChannelInputSchema,
  createGroupConversationInputSchema,
  destinationKindSchema,
  destinationSchema,
  messagePageSchema,
  messageSchema,
  publicUserSchema,
  reactionSummarySchema,
  searchResultSchema,
  searchResultsResponseSchema,
  threadResponseSchema,
  updateChannelInputSchema,
  workspaceMemberListResponseSchema,
  workspaceMemberSchema,
} from '../schemas/chat'

export type DestinationKind = z.infer<typeof destinationKindSchema>
export type Destination = z.infer<typeof destinationSchema>
export type PublicUser = z.infer<typeof publicUserSchema>
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>

export type CreateChannelInput = z.output<typeof createChannelInputSchema>
export type UpdateChannelInput = z.output<typeof updateChannelInputSchema>
export type Channel = z.infer<typeof channelSchema>
export type ChannelSummary = z.infer<typeof channelSummarySchema>
export type ChannelMember = z.infer<typeof channelMemberSchema>

export type Conversation = z.infer<typeof conversationSchema>
export type ConversationSummary = z.infer<typeof conversationSummarySchema>
export type CreateGroupConversationInput = z.output<typeof createGroupConversationInputSchema>

export type ReactionSummary = z.infer<typeof reactionSummarySchema>
export type Attachment = z.infer<typeof attachmentSchema>
export type Message = z.infer<typeof messageSchema>
export type MessagePage = z.infer<typeof messagePageSchema>
export type ThreadResponse = z.infer<typeof threadResponseSchema>
export type SearchResult = z.infer<typeof searchResultSchema>

export type ChannelListResponse = z.infer<typeof channelListResponseSchema>
export type ChannelMemberListResponse = z.infer<typeof channelMemberListResponseSchema>
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>
export type SearchResultsResponse = z.infer<typeof searchResultsResponseSchema>
export type WorkspaceMemberListResponse = z.infer<typeof workspaceMemberListResponseSchema>
