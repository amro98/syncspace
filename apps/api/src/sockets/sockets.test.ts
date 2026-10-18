import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  CLIENT_EVENTS,
  type ClientToServerEvents,
  rooms,
  SERVER_EVENTS,
  type ServerToClientEvents,
  type SocketAck,
} from '@syncspace/shared'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, describe, expect, it } from 'vitest'

import { ACCESS_TOKEN_COOKIE } from '@/config/auth'
import { signAccessToken } from '@/lib/tokens'

import { createSocketServer, realtime } from './index'
import type { RoomAccessPolicy } from './room-access'
import type { TypedServer } from './types'

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>

const allowAll: RoomAccessPolicy = {
  canJoinWorkspace: () => Promise.resolve(true),
  canJoinChannel: () => Promise.resolve(true),
}

let httpServer: HttpServer | undefined
let io: TypedServer | undefined
const clients: TestClient[] = []

async function startServer(roomAccess?: RoomAccessPolicy): Promise<string> {
  httpServer = createServer()
  io = createSocketServer(httpServer, roomAccess ? { roomAccess } : {})
  realtime.attach(io)
  await new Promise<void>((resolve) => httpServer?.listen(0, resolve))
  const { port } = httpServer.address() as AddressInfo
  return `http://localhost:${String(port)}`
}

function createClient(url: string, userId?: string): TestClient {
  const client: TestClient = connect(url, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: userId ? { cookie: `${ACCESS_TOKEN_COOKIE}=${signAccessToken(userId)}` } : {},
  })
  clients.push(client)
  return client
}

function waitForConnect(client: TestClient): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('connect', resolve)
    client.once('connect_error', reject)
  })
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  realtime.detach()
  await io?.close()
  io = undefined
  httpServer = undefined
})

describe('socket server', () => {
  it('rejects connections without a session cookie', async () => {
    const client = createClient(await startServer())

    const error = await new Promise<Error & { data?: { code?: string } }>((resolve) => {
      client.once('connect_error', resolve)
    })
    expect(error.data?.code).toBe('UNAUTHENTICATED')
  })

  it('denies room joins by default', async () => {
    const client = createClient(await startServer(), 'user-1')
    await waitForConnect(client)

    const ack: SocketAck = await client.emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, {
      workspaceId: 'w1',
    })
    expect(ack).toEqual({ ok: false, error: { code: 'FORBIDDEN', message: expect.any(String) } })
  })

  it('validates join payloads', async () => {
    const client = createClient(await startServer(allowAll), 'user-1')
    await waitForConnect(client)

    const ack = await client.emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, { workspaceId: '' })
    expect(ack.ok).toBe(false)
    expect(!ack.ok && ack.error.code).toBe('VALIDATION_ERROR')
  })

  it('delivers server events to joined rooms and to the personal user room', async () => {
    const client = createClient(await startServer(allowAll), 'user-1')
    await waitForConnect(client)

    const ack = await client.emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, { workspaceId: 'w1' })
    expect(ack).toEqual({ ok: true, data: null })

    const workspaceUpdate = new Promise((resolve) => {
      client.once(SERVER_EVENTS.WORKSPACE_UPDATED, resolve)
    })
    realtime.emit(rooms.workspace('w1'), SERVER_EVENTS.WORKSPACE_UPDATED, { workspaceId: 'w1' })
    await expect(workspaceUpdate).resolves.toEqual({ workspaceId: 'w1' })

    const notification = new Promise((resolve) => {
      client.once(SERVER_EVENTS.NOTIFICATION_CREATED, resolve)
    })
    realtime.emit(rooms.user('user-1'), SERVER_EVENTS.NOTIFICATION_CREATED, {
      notificationId: 'n1',
    })
    await expect(notification).resolves.toEqual({ notificationId: 'n1' })
  })
})
