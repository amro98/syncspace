import { vi } from 'vitest'

type Handler = (...args: unknown[]) => void

const handlers = new Map<string, Set<Handler>>()

function emitLocal(event: string, ...args: unknown[]) {
  for (const handler of handlers.get(event) ?? []) handler(...args)
}

/**
 * In-memory stand-in for the Socket.IO client (tests never open network
 * connections). `connect()` succeeds asynchronously; room joins are acked ok.
 */
export const fakeSocket = {
  connected: false,
  on(event: string, handler: Handler) {
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event)?.add(handler)
    return fakeSocket
  },
  off(event: string, handler: Handler) {
    handlers.get(event)?.delete(handler)
    return fakeSocket
  },
  connect() {
    fakeSocket.connected = true
    queueMicrotask(() => {
      emitLocal('connect')
    })
    return fakeSocket
  },
  disconnect() {
    if (fakeSocket.connected) {
      fakeSocket.connected = false
      emitLocal('disconnect', 'io client disconnect')
    }
    return fakeSocket
  },
  emitWithAck: vi.fn((_event: string, _payload: unknown) =>
    Promise.resolve({ ok: true as const, data: null }),
  ),
}

export function resetFakeSocket() {
  handlers.clear()
  fakeSocket.connected = false
  fakeSocket.emitWithAck.mockClear()
}
