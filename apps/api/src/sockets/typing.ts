import { type Destination, type RoomName, rooms, SERVER_EVENTS } from '@syncspace/shared'

import type { TypedServer } from './types'

/** A typing indicator disappears this long after the last `typing:start`. */
export const TYPING_TTL_MS = 6_000

export function destinationRoom(destination: Destination): RoomName {
  return destination.kind === 'channel'
    ? rooms.channel(destination.id)
    : rooms.conversation(destination.id)
}

/**
 * Ephemeral, never persisted. Per destination room: userId -> expiry timer.
 * Every change broadcasts the full list of typers to that room only (people
 * viewing the destination — who, by joining, proved access).
 */
export function createTypingTracker(io: TypedServer, ttlMs = TYPING_TTL_MS) {
  const typers = new Map<RoomName, Map<string, NodeJS.Timeout>>()

  function broadcast(room: RoomName, destination: Destination) {
    io.to(room).emit(SERVER_EVENTS.TYPING_UPDATED, {
      destination,
      userIds: [...(typers.get(room)?.keys() ?? [])],
    })
  }

  function stop(destination: Destination, userId: string) {
    const room = destinationRoom(destination)
    const current = typers.get(room)
    const timer = current?.get(userId)
    if (!current || !timer) return
    clearTimeout(timer)
    current.delete(userId)
    if (current.size === 0) typers.delete(room)
    broadcast(room, destination)
  }

  function start(destination: Destination, userId: string) {
    const room = destinationRoom(destination)
    const current = typers.get(room) ?? new Map<string, NodeJS.Timeout>()
    typers.set(room, current)
    const existing = current.get(userId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      stop(destination, userId)
    }, ttlMs)
    timer.unref()
    current.set(userId, timer)
    // Refreshes are silent; only the first start announces.
    if (!existing) broadcast(room, destination)
  }

  /** On disconnect: clear the user from every destination they were typing in. */
  function stopEverywhere(userId: string) {
    for (const [room, current] of typers) {
      if (!current.has(userId)) continue
      const [kind, id] = room.split(':') as ['channel' | 'conversation', string]
      stop({ kind, id }, userId)
    }
  }

  return { start, stop, stopEverywhere }
}

export type TypingTracker = ReturnType<typeof createTypingTracker>
