import {
  type ChannelSummary,
  channelListResponseSchema,
  channelMemberListResponseSchema,
  channelSchema,
  channelSummarySchema,
  conversationListResponseSchema,
  conversationSummarySchema,
  type CreateChannelInput,
  type CreateGroupConversationInput,
  type Destination,
  messagePageSchema,
  messageSchema,
  reactionUpdateSchema,
  readCursorSchema,
  searchResultsResponseSchema,
  threadResponseSchema,
  type UpdateChannelInput,
  workspaceMemberListResponseSchema,
} from '@syncspace/shared'

import { apiClient } from '@/lib/api-client'

const ws = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`

function destinationPath(workspaceId: string, destination: Destination) {
  const segment = destination.kind === 'channel' ? 'channels' : 'conversations'
  return `${ws(workspaceId)}/${segment}/${encodeURIComponent(destination.id)}`
}

// Directory ---------------------------------------------------------------------

export async function fetchMembers(workspaceId: string, signal?: AbortSignal) {
  const { items } = await apiClient.get(`${ws(workspaceId)}/members`, {
    schema: workspaceMemberListResponseSchema,
    ...(signal && { signal }),
  })
  return items
}

// Channels ----------------------------------------------------------------------

export async function fetchChannels(workspaceId: string, signal?: AbortSignal) {
  const { items } = await apiClient.get(`${ws(workspaceId)}/channels`, {
    schema: channelListResponseSchema,
    ...(signal && { signal }),
  })
  return items
}

export function createChannel(
  workspaceId: string,
  input: CreateChannelInput,
): Promise<ChannelSummary> {
  return apiClient.post(`${ws(workspaceId)}/channels`, {
    body: input,
    schema: channelSummarySchema,
  })
}

export function updateChannel(workspaceId: string, channelId: string, input: UpdateChannelInput) {
  return apiClient.patch(`${ws(workspaceId)}/channels/${channelId}`, {
    body: input,
    schema: channelSchema,
  })
}

export function setChannelArchived(workspaceId: string, channelId: string, archived: boolean) {
  return apiClient.post(
    `${ws(workspaceId)}/channels/${channelId}/${archived ? 'archive' : 'unarchive'}`,
    { schema: channelSchema },
  )
}

export async function fetchChannelMembers(workspaceId: string, channelId: string) {
  const { items } = await apiClient.get(`${ws(workspaceId)}/channels/${channelId}/members`, {
    schema: channelMemberListResponseSchema,
  })
  return items
}

export async function addChannelMember(workspaceId: string, channelId: string, userId: string) {
  const { items } = await apiClient.post(`${ws(workspaceId)}/channels/${channelId}/members`, {
    body: { userId },
    schema: channelMemberListResponseSchema,
  })
  return items
}

export function removeChannelMember(workspaceId: string, channelId: string, userId: string) {
  return apiClient.delete<undefined>(`${ws(workspaceId)}/channels/${channelId}/members/${userId}`)
}

// Conversations -----------------------------------------------------------------

export async function fetchConversations(workspaceId: string, signal?: AbortSignal) {
  const { items } = await apiClient.get(`${ws(workspaceId)}/conversations`, {
    schema: conversationListResponseSchema,
    ...(signal && { signal }),
  })
  return items
}

export function openDirectConversation(workspaceId: string, targetUserId: string) {
  return apiClient.post(`${ws(workspaceId)}/conversations/direct`, {
    body: { targetUserId },
    schema: conversationSummarySchema,
  })
}

export function createGroupConversation(workspaceId: string, input: CreateGroupConversationInput) {
  return apiClient.post(`${ws(workspaceId)}/conversations/group`, {
    body: input,
    schema: conversationSummarySchema,
  })
}

// Messages ----------------------------------------------------------------------

export function fetchMessages(
  workspaceId: string,
  destination: Destination,
  before: string | undefined,
  signal?: AbortSignal,
) {
  return apiClient.get(`${destinationPath(workspaceId, destination)}/messages`, {
    query: { before },
    schema: messagePageSchema,
    ...(signal && { signal }),
  })
}

export function sendMessage(
  workspaceId: string,
  destination: Destination,
  input: { content: string; clientMessageId: string },
) {
  return apiClient.post(`${destinationPath(workspaceId, destination)}/messages`, {
    body: input,
    schema: messageSchema,
  })
}

export function markRead(workspaceId: string, destination: Destination, messageId: string) {
  return apiClient.post(`${destinationPath(workspaceId, destination)}/read`, {
    body: { messageId },
    schema: readCursorSchema,
  })
}

export function editMessage(messageId: string, content: string) {
  return apiClient.patch(`/messages/${messageId}`, { body: { content }, schema: messageSchema })
}

export function deleteMessage(messageId: string) {
  return apiClient.delete(`/messages/${messageId}`, { schema: messageSchema })
}

export function fetchThread(messageId: string, signal?: AbortSignal) {
  return apiClient.get(`/messages/${messageId}/replies`, {
    schema: threadResponseSchema,
    ...(signal && { signal }),
  })
}

export function sendReply(messageId: string, input: { content: string; clientMessageId: string }) {
  return apiClient.post(`/messages/${messageId}/replies`, { body: input, schema: messageSchema })
}

export function toggleReaction(messageId: string, emoji: string) {
  return apiClient.post(`/messages/${messageId}/reactions`, {
    body: { emoji },
    schema: reactionUpdateSchema,
  })
}

// Search ------------------------------------------------------------------------

export async function searchMessages(workspaceId: string, q: string, signal?: AbortSignal) {
  const { items } = await apiClient.get(`${ws(workspaceId)}/search/messages`, {
    query: { q },
    schema: searchResultsResponseSchema,
    ...(signal && { signal }),
  })
  return items
}
