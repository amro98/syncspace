/**
 * Ephemeral presence: userId -> number of connected sockets (tabs/devices).
 * A user is online while at least one socket is connected; they go offline
 * only when the LAST one disconnects (after a short grace period, so a page
 * reload does not flicker offline). In-memory: one API instance; scaling out
 * needs a shared store (e.g. Redis) — see docs/CHAT.md.
 */
const connections = new Map<string, number>()
const offlineTimers = new Map<string, NodeJS.Timeout>()

export const presence = {
  isOnline(userId: string): boolean {
    return (connections.get(userId) ?? 0) > 0
  },

  /** Returns true when this connection made the user (newly) online. */
  connect(userId: string): boolean {
    const pending = offlineTimers.get(userId)
    if (pending) {
      clearTimeout(pending)
      offlineTimers.delete(userId)
    }
    const count = (connections.get(userId) ?? 0) + 1
    connections.set(userId, count)
    // A reconnect within the grace period never announced "offline": nothing changes.
    return count === 1 && !pending
  },

  /**
   * Call on disconnect. When the last socket closes, `onOffline` runs after
   * `graceMs` unless the user reconnected in the meantime.
   */
  disconnect(userId: string, graceMs: number, onOffline: () => void): void {
    const count = Math.max(0, (connections.get(userId) ?? 0) - 1)
    if (count > 0) {
      connections.set(userId, count)
      return
    }
    connections.delete(userId)
    const timer = setTimeout(() => {
      offlineTimers.delete(userId)
      if (!presence.isOnline(userId)) onOffline()
    }, graceMs)
    timer.unref()
    offlineTimers.set(userId, timer)
  },

  /** Test helper: forget all state. */
  reset(): void {
    for (const timer of offlineTimers.values()) clearTimeout(timer)
    offlineTimers.clear()
    connections.clear()
  },
}
