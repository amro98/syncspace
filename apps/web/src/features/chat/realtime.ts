import {
  type ChannelSummary,
  CLIENT_EVENTS,
  type ConversationSummary,
  type Destination,
  type Message,
  SERVER_EVENTS,
  type ServerToClientEvents,
  type ThreadResponse,
  type WorkspaceMember,
} from '@syncspace/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useSession } from '@/features/auth/hooks'
import { queryKeys } from '@/lib/query-keys'
import { getSocket } from '@/lib/socket'
import { useChatStore } from '@/stores/chat-store'
import { useRealtimeStore } from '@/stores/realtime-store'

import {
  bumpUnread,
  destinationKey,
  insertMessage,
  markListRead,
  removeChannel,
  replaceMessage,
  setReactions,
  type TimelineData,
  updateMessage,
  upsertChannel,
  upsertConversation,
} from './cache'

type Handlers = { [E in keyof ServerToClientEvents]?: ServerToClientEvents[E] }

/**
 * Subscribes the workspace's chat caches to the socket. Every event is a
 * targeted cache write (no blanket refetch). Mounted once per open workspace.
 */
export function useChatRealtime(workspaceId: string): void {
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    const socket = getSocket()
    const channelsKey = queryKeys.channels.list(workspaceId)
    const conversationsKey = queryKeys.conversations.list(workspaceId)
    const membersKey = queryKeys.members.list(workspaceId)

    const listKey = (destination: Destination) =>
      destination.kind === 'channel' ? channelsKey : conversationsKey

    const applyToThread = (
      parentId: string,
      update: (thread: ThreadResponse) => ThreadResponse,
    ) => {
      queryClient.setQueryData<ThreadResponse>(queryKeys.messages.thread(parentId), (thread) =>
        thread ? update(thread) : thread,
      )
    }

    const applyMessage = (message: Message) => {
      queryClient.setQueryData<TimelineData>(
        queryKeys.messages.destination(message.destination),
        (data) => replaceMessage(data, message),
      )
      const parentId = message.parentMessageId ?? message.id
      applyToThread(parentId, (thread) => ({
        ...thread,
        parent: thread.parent.id === message.id ? message : thread.parent,
        items: thread.items.map((item) => (item.id === message.id ? message : item)),
      }))
    }

    const handlers: Handlers = {
      [SERVER_EVENTS.MESSAGE_CREATED]: ({ message, clientMessageId, parent }) => {
        if (message.workspaceId !== workspaceId) return
        if (message.parentMessageId) {
          applyToThread(message.parentMessageId, (thread) =>
            thread.items.some((item) => item.id === message.id)
              ? thread
              : { ...thread, items: [...thread.items, message] },
          )
          if (parent) {
            queryClient.setQueryData<TimelineData>(
              queryKeys.messages.destination(message.destination),
              (data) =>
                updateMessage(data, parent.id, (m) => ({ ...m, replyCount: parent.replyCount })),
            )
            applyToThread(parent.id, (thread) => ({
              ...thread,
              parent: { ...thread.parent, replyCount: parent.replyCount },
            }))
          }
          return
        }

        queryClient.setQueryData<TimelineData>(
          queryKeys.messages.destination(message.destination),
          (data) => insertMessage(data, message, clientMessageId),
        )

        if (message.destination.kind === 'conversation') {
          const known = queryClient
            .getQueryData<ConversationSummary[]>(conversationsKey)
            ?.find((c) => c.id === message.destination.id)
          if (known) {
            queryClient.setQueryData<ConversationSummary[]>(conversationsKey, (list) =>
              upsertConversation(list, { ...known, lastActivityAt: message.createdAt }),
            )
          } else {
            void queryClient.invalidateQueries({ queryKey: conversationsKey })
          }
        }

        const reading = useChatStore.getState().readingKey === destinationKey(message.destination)
        if (message.author.id !== userId && !reading) {
          queryClient.setQueryData<(ChannelSummary | ConversationSummary)[]>(
            listKey(message.destination),
            (list) => bumpUnread(list, message.destination.id),
          )
        }
      },

      [SERVER_EVENTS.MESSAGE_UPDATED]: ({ message }) => {
        applyMessage(message)
      },

      [SERVER_EVENTS.MESSAGE_DELETED]: ({ message }) => {
        applyMessage(message)
        if (message.parentMessageId) {
          const parentId = message.parentMessageId
          queryClient.setQueryData<TimelineData>(
            queryKeys.messages.destination(message.destination),
            (data) =>
              updateMessage(data, parentId, (m) => ({
                ...m,
                replyCount: Math.max(0, m.replyCount - 1),
              })),
          )
        }
      },

      [SERVER_EVENTS.REACTION_UPDATED]: ({
        messageId,
        destination,
        parentMessageId,
        reactions,
      }) => {
        queryClient.setQueryData<TimelineData>(
          queryKeys.messages.destination(destination),
          (data) => setReactions(data, messageId, reactions),
        )
        applyToThread(parentMessageId ?? messageId, (thread) => ({
          ...thread,
          parent: thread.parent.id === messageId ? { ...thread.parent, reactions } : thread.parent,
          items: thread.items.map((item) =>
            item.id === messageId ? { ...item, reactions } : item,
          ),
        }))
      },

      [SERVER_EVENTS.TYPING_UPDATED]: ({ destination, userIds }) => {
        useChatStore.getState().setTyping(destinationKey(destination), userIds)
      },

      [SERVER_EVENTS.PRESENCE_UPDATED]: ({ userId: who, status, lastActiveAt }) => {
        queryClient.setQueryData<WorkspaceMember[]>(membersKey, (members) =>
          members?.map((member) =>
            member.id === who
              ? {
                  ...member,
                  online: status !== 'offline',
                  lastSeenAt: status === 'offline' ? lastActiveAt : member.lastSeenAt,
                }
              : member,
          ),
        )
      },

      [SERVER_EVENTS.CHANNEL_CREATED]: ({ channel }) => {
        if (channel.workspaceId !== workspaceId) return
        queryClient.setQueryData<ChannelSummary[]>(channelsKey, (list) =>
          upsertChannel(list, channel),
        )
      },

      [SERVER_EVENTS.CHANNEL_UPDATED]: ({ channel }) => {
        if (channel.workspaceId !== workspaceId) return
        queryClient.setQueryData<ChannelSummary[]>(channelsKey, (list) =>
          upsertChannel(list, channel),
        )
      },

      [SERVER_EVENTS.CHANNEL_REMOVED]: ({ workspaceId: from, channelId }) => {
        if (from !== workspaceId) return
        queryClient.setQueryData<ChannelSummary[]>(channelsKey, (list) =>
          removeChannel(list, channelId),
        )
        queryClient.removeQueries({ queryKey: queryKeys.messages.channel(channelId) })
      },

      [SERVER_EVENTS.CONVERSATION_CREATED]: ({ conversation }) => {
        if (conversation.workspaceId !== workspaceId) return
        queryClient.setQueryData<ConversationSummary[]>(conversationsKey, (list) =>
          upsertConversation(list, conversation),
        )
      },

      [SERVER_EVENTS.CONVERSATION_UPDATED]: ({ conversation }) => {
        if (conversation.workspaceId !== workspaceId) return
        queryClient.setQueryData<ConversationSummary[]>(conversationsKey, (list) =>
          upsertConversation(list, conversation),
        )
      },

      [SERVER_EVENTS.READ_UPDATED]: ({ destination, cursor }) => {
        queryClient.setQueryData<(ChannelSummary | ConversationSummary)[]>(
          listKey(destination),
          (list) => markListRead(list, destination.id, cursor),
        )
      },
    }

    // After a reconnect, events may have been missed: refresh lists and open timelines.
    // (Deduplication by id makes the refetch safe.)
    let connectedBefore = socket.connected
    const onConnect = () => {
      if (connectedBefore) {
        void queryClient.invalidateQueries({ queryKey: channelsKey })
        void queryClient.invalidateQueries({ queryKey: conversationsKey })
        void queryClient.invalidateQueries({ queryKey: membersKey })
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all() })
      }
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
  }, [queryClient, workspaceId, userId])
}

/**
 * Joins the destination's room while it is open (typing indicators, private
 * channel oversight, conversation events) and re-joins after reconnects.
 */
export function useDestinationRoom(workspaceId: string, destination: Destination): void {
  const connected = useRealtimeStore((state) => state.connection === 'connected')
  const { kind, id } = destination

  useEffect(() => {
    if (!connected) return
    const socket = getSocket()
    const join =
      kind === 'channel'
        ? socket.emitWithAck(CLIENT_EVENTS.CHANNEL_JOIN, { workspaceId, channelId: id })
        : socket.emitWithAck(CLIENT_EVENTS.CONVERSATION_JOIN, { workspaceId, conversationId: id })
    void join.catch(() => undefined)

    return () => {
      useChatStore.getState().setTyping(`${kind}:${id}`, [])
      if (!socket.connected) return
      const leave =
        kind === 'channel'
          ? socket.emitWithAck(CLIENT_EVENTS.CHANNEL_LEAVE, { workspaceId, channelId: id })
          : socket.emitWithAck(CLIENT_EVENTS.CONVERSATION_LEAVE, {
              workspaceId,
              conversationId: id,
            })
      void leave.catch(() => undefined)
    }
  }, [connected, workspaceId, kind, id])
}

/** Throttled typing:start / delayed typing:stop for a composer. */
export function createTypingEmitter(destination: Destination) {
  const START_INTERVAL_MS = 2_500
  const IDLE_MS = 3_000
  let lastStart = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  const stop = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
    if (lastStart === 0) return
    lastStart = 0
    getSocket().emit(CLIENT_EVENTS.TYPING_STOP, { destination })
  }

  return {
    typed() {
      const now = Date.now()
      if (now - lastStart > START_INTERVAL_MS) {
        lastStart = now
        getSocket().emit(CLIENT_EVENTS.TYPING_START, { destination })
      }
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(stop, IDLE_MS)
    },
    stop,
  }
}
