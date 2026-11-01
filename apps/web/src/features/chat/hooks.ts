import type {
  ChannelSummary,
  ConversationSummary,
  CreateChannelInput,
  Destination,
  Message,
  ThreadResponse,
  UpdateChannelInput,
} from '@syncspace/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import { useSession } from '@/features/auth/hooks'
import type { ApiError } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { useChatStore } from '@/stores/chat-store'

import * as api from './api'
import {
  destinationKey,
  insertMessage,
  insertOptimistic,
  markListRead,
  removeChannel,
  replaceMessage,
  setOptimisticStatus,
  setReactions,
  type TimelineData,
  type TimelineMessage,
  type TimelinePage,
  upsertChannel,
  upsertConversation,
} from './cache'

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useChannels(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.channels.list(workspaceId),
    queryFn: ({ signal }) => api.fetchChannels(workspaceId, signal),
  })
}

export function useConversations(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.conversations.list(workspaceId),
    queryFn: ({ signal }) => api.fetchConversations(workspaceId, signal),
  })
}

export function useWorkspaceMembers(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.members.list(workspaceId),
    queryFn: ({ signal }) => api.fetchMembers(workspaceId, signal),
    staleTime: 60_000,
  })
}

export function useChannelMembers(workspaceId: string, channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.channels.members(workspaceId, channelId),
    queryFn: () => api.fetchChannelMembers(workspaceId, channelId),
    enabled,
  })
}

/** Paged timeline: first page = newest messages; fetchNextPage loads older ones. */
export function useMessages(workspaceId: string, destination: Destination) {
  return useInfiniteQuery<
    TimelinePage,
    ApiError,
    TimelineData,
    ReturnType<typeof queryKeys.messages.destination>,
    string | undefined
  >({
    queryKey: queryKeys.messages.destination(destination),
    queryFn: ({ pageParam, signal }) =>
      api.fetchMessages(workspaceId, destination, pageParam, signal),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // Realtime events keep it current; refetch only on reconnect / remount after a while.
    staleTime: 5 * 60_000,
  })
}

export function useThread(parentMessageId: string) {
  return useQuery({
    queryKey: queryKeys.messages.thread(parentMessageId),
    queryFn: ({ signal }) => api.fetchThread(parentMessageId, signal),
  })
}

// ---------------------------------------------------------------------------
// Sending (optimistic)
// ---------------------------------------------------------------------------

/**
 * Optimistic send:
 * 1. insert a `sending` row with a client-generated id (temp:<uuid>);
 * 2. POST with that clientMessageId;
 * 3. the REST response or the socket echo — whichever comes first — replaces
 *    the row (matched by clientMessageId); the other is deduplicated by id;
 * 4. on failure the row turns `failed` (retry / discard) and the text stays.
 */
export function useSendMessage(workspaceId: string, destination: Destination) {
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const key = queryKeys.messages.destination(destination)

  return useMutation({
    mutationFn: (input: { content: string; clientMessageId: string }) =>
      api.sendMessage(workspaceId, destination, input),
    onMutate: ({ content, clientMessageId }) => {
      if (!user) return
      const optimistic: TimelineMessage = {
        id: `temp:${clientMessageId}`,
        clientMessageId,
        status: 'sending',
        workspaceId,
        destination,
        parentMessageId: null,
        author: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
        content,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        reactions: [],
        replyCount: 0,
        attachments: [],
      }
      queryClient.setQueryData<TimelineData>(key, (data) => insertOptimistic(data, optimistic))
    },
    onSuccess: (message, { clientMessageId }) => {
      queryClient.setQueryData<TimelineData>(key, (data) =>
        insertMessage(data, message, clientMessageId),
      )
    },
    onError: (_error, { clientMessageId }) => {
      queryClient.setQueryData<TimelineData>(key, (data) =>
        setOptimisticStatus(data, clientMessageId, 'failed'),
      )
    },
  })
}

export function useSendReply(parentMessageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { content: string; clientMessageId: string }) =>
      api.sendReply(parentMessageId, input),
    onSuccess: (reply) => {
      queryClient.setQueryData<ThreadResponse>(
        queryKeys.messages.thread(parentMessageId),
        (thread) =>
          thread && !thread.items.some((item) => item.id === reply.id)
            ? { ...thread, items: [...thread.items, reply] }
            : thread,
      )
    },
  })
}

/** Applies a confirmed message to whichever caches show it (timeline and/or thread). */
export function useApplyMessage() {
  const queryClient = useQueryClient()
  return useCallback(
    (message: Message) => {
      queryClient.setQueryData<TimelineData>(
        queryKeys.messages.destination(message.destination),
        (data) => replaceMessage(data, message),
      )
      const threadKey = queryKeys.messages.thread(message.parentMessageId ?? message.id)
      queryClient.setQueryData<ThreadResponse>(threadKey, (thread) =>
        thread
          ? {
              ...thread,
              parent: thread.parent.id === message.id ? message : thread.parent,
              items: thread.items.map((item) => (item.id === message.id ? message : item)),
            }
          : thread,
      )
    },
    [queryClient],
  )
}

export function useEditMessage() {
  const apply = useApplyMessage()
  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      api.editMessage(messageId, content),
    onSuccess: apply,
  })
}

export function useDeleteMessage() {
  const apply = useApplyMessage()
  return useMutation({ mutationFn: api.deleteMessage, onSuccess: apply })
}

export function useToggleReaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api.toggleReaction(messageId, emoji),
    onSuccess: ({ messageId, destination, parentMessageId, reactions }) => {
      queryClient.setQueryData<TimelineData>(queryKeys.messages.destination(destination), (data) =>
        setReactions(data, messageId, reactions),
      )
      const threadKey = queryKeys.messages.thread(parentMessageId ?? messageId)
      queryClient.setQueryData<ThreadResponse>(threadKey, (thread) =>
        thread
          ? {
              ...thread,
              parent:
                thread.parent.id === messageId ? { ...thread.parent, reactions } : thread.parent,
              items: thread.items.map((item) =>
                item.id === messageId ? { ...item, reactions } : item,
              ),
            }
          : thread,
      )
    },
  })
}

// ---------------------------------------------------------------------------
// Read state
// ---------------------------------------------------------------------------

const READ_DEBOUNCE_MS = 400

/**
 * Coalesced "mark as read": many calls within a short window send one request,
 * and only when the message is newer than what the server already has.
 */
export function useMarkRead(workspaceId: string, destination: Destination) {
  const queryClient = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentUpTo = useRef<string | null>(null)
  const listKey =
    destination.kind === 'channel'
      ? queryKeys.channels.list(workspaceId)
      : queryKeys.conversations.list(workspaceId)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return useCallback(
    (message: { id: string; createdAt: string }) => {
      if (sentUpTo.current && sentUpTo.current >= message.createdAt) return
      const list = queryClient.getQueryData<(ChannelSummary | ConversationSummary)[]>(listKey)
      const summary = list?.find((item) => item.id === destination.id)
      // Already read on the server (e.g. own message) and nothing unread: nothing to send.
      if (
        summary?.unreadCount === 0 &&
        summary.lastReadAt &&
        summary.lastReadAt >= message.createdAt
      ) {
        return
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        sentUpTo.current = message.createdAt
        // Optimistically clear the badge.
        queryClient.setQueryData(
          listKey,
          (items: (ChannelSummary | ConversationSummary)[] | undefined) =>
            markListRead(items, destination.id, {
              lastReadAt: message.createdAt,
              lastReadMessageId: message.id,
            }),
        )
        api.markRead(workspaceId, destination, message.id).catch(() => {
          sentUpTo.current = null
        })
      }, READ_DEBOUNCE_MS)
    },
    [queryClient, listKey, workspaceId, destination],
  )
}

// ---------------------------------------------------------------------------
// Channels & conversations
// ---------------------------------------------------------------------------

export function useCreateChannel(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateChannelInput) => api.createChannel(workspaceId, input),
    onSuccess: (channel) => {
      // The creator's own summary (isMember, read state) wins over the broadcast.
      queryClient.setQueryData<ChannelSummary[]>(queryKeys.channels.list(workspaceId), (list) =>
        list
          ? [...list.filter((c) => c.id !== channel.id), channel].sort((a, b) =>
              a.name.localeCompare(b.name),
            )
          : list,
      )
    },
  })
}

export function useUpdateChannel(workspaceId: string, channelId: string) {
  const queryClient = useQueryClient()
  const listKey = queryKeys.channels.list(workspaceId)
  return useMutation({
    mutationFn: (input: UpdateChannelInput) => api.updateChannel(workspaceId, channelId, input),
    onSuccess: (channel) => {
      queryClient.setQueryData<ChannelSummary[]>(listKey, (list) => upsertChannel(list, channel))
    },
  })
}

export function useSetChannelArchived(workspaceId: string, channelId: string) {
  const queryClient = useQueryClient()
  const listKey = queryKeys.channels.list(workspaceId)
  return useMutation({
    mutationFn: (archived: boolean) => api.setChannelArchived(workspaceId, channelId, archived),
    onSuccess: (channel) => {
      queryClient.setQueryData<ChannelSummary[]>(listKey, (list) => upsertChannel(list, channel))
    },
  })
}

export function useAddChannelMember(workspaceId: string, channelId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.addChannelMember(workspaceId, channelId, userId),
    onSuccess: (members) => {
      queryClient.setQueryData(queryKeys.channels.members(workspaceId, channelId), members)
      queryClient.setQueryData<ChannelSummary[]>(queryKeys.channels.list(workspaceId), (list) =>
        list?.map((c) => (c.id === channelId ? { ...c, memberCount: members.length } : c)),
      )
    },
  })
}

/** Removes a member, or the viewer themself ("leave channel"). */
export function useRemoveChannelMember(workspaceId: string, channelId: string) {
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  return useMutation({
    mutationFn: (userId: string) => api.removeChannelMember(workspaceId, channelId, userId),
    onSuccess: (_result, userId) => {
      if (userId === user?.id) {
        // Admins keep oversight access (the server says so with channel:updated);
        // everyone else loses the channel. Refetch to get the authoritative view.
        queryClient.setQueryData<ChannelSummary[]>(queryKeys.channels.list(workspaceId), (list) =>
          removeChannel(list, channelId),
        )
        void queryClient.invalidateQueries({ queryKey: queryKeys.channels.list(workspaceId) })
        return
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.channels.members(workspaceId, channelId),
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.channels.list(workspaceId) })
    },
  })
}

/** One person → find-or-create the DM; several → a new group conversation. */
export function useStartConversation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userIds, name }: { userIds: string[]; name?: string }) => {
      const [only] = userIds
      return userIds.length === 1 && only
        ? api.openDirectConversation(workspaceId, only)
        : api.createGroupConversation(workspaceId, {
            participantIds: userIds,
            ...(name && { name }),
          })
    },
    onSuccess: (conversation) => {
      queryClient.setQueryData<ConversationSummary[]>(
        queryKeys.conversations.list(workspaceId),
        (list) => {
          const known = list?.find((c) => c.id === conversation.id)
          return known
            ? upsertConversation(list, { ...conversation, ...known })
            : upsertConversation(list, conversation)
        },
      )
    },
  })
}

export function useSearchMessages(workspaceId: string, query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: queryKeys.search(workspaceId, q),
    queryFn: ({ signal }) => api.searchMessages(workspaceId, q, signal),
    enabled: q.length >= 2,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export function useDraft(key: string): [string, (text: string) => void] {
  const draft = useChatStore((state) => state.drafts[key] ?? '')
  const setDraft = useChatStore((state) => state.setDraft)
  const update = useCallback(
    (text: string) => {
      setDraft(key, text)
    },
    [key, setDraft],
  )
  return [draft, update]
}

export { destinationKey }
