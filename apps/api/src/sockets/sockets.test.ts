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

import { getPrisma } from '@/lib/prisma'
import { createUser, sessionCookie, uniqueSlug } from '@/test/helpers'

import { createSocketServer, realtime } from './index'
import { membershipRoomAccess, type RoomAccessPolicy } from './room-access'
import type { TypedServer } from './types'

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>

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

function createClient(url: string, cookie?: string): TestClient {
  const client: TestClient = connect(url, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: cookie ? { cookie } : {},
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

/** A workspace with an owner, plus a private channel the owner is NOT a member of. */
async function workspaceFixture() {
  const owner = await createUser()
  const prisma = getPrisma()
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Socket Co',
      slug: uniqueSlug('socket'),
      ownerId: owner.id,
      members: { create: { userId: owner.id, role: 'OWNER' } },
    },
  })
  const member = await createUser()
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: member.id, role: 'MEMBER' },
  })
  const privateChannel = await prisma.channel.create({
    data: { workspaceId: workspace.id, name: 'secret', slug: 'secret', type: 'PRIVATE' },
  })
  return { owner, member, workspace, privateChannel }
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  realtime.detach()
  await io?.close()
  io = undefined
  httpServer = undefined
})

describe('socket authentication', () => {
  it('rejects connections without a session cookie', async () => {
    const client = createClient(await startServer())
    const error = await new Promise<Error & { data?: { code?: string } }>((resolve) => {
      client.once('connect_error', resolve)
    })
    expect(error.data?.code).toBe('UNAUTHENTICATED')
  })

  it('rejects revoked sessions', async () => {
    const user = await createUser()
    const cookie = sessionCookie(user)
    await getPrisma().user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    })
    const client = createClient(await startServer(), cookie)
    await expect(waitForConnect(client)).rejects.toThrow()
  })

  it('denies room joins when no policy is configured', async () => {
    const { owner, workspace } = await workspaceFixture()
    const client = createClient(await startServer(), sessionCookie(owner))
    await waitForConnect(client)

    const ack: SocketAck = await client.emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, {
      workspaceId: workspace.id,
    })
    expect(ack).toEqual({ ok: false, error: { code: 'FORBIDDEN', message: expect.any(String) } })
  })
})

describe('membership room policy', () => {
  it('lets members join their workspace room and receive events (and their user room)', async () => {
    const { member, workspace } = await workspaceFixture()
    const client = createClient(await startServer(membershipRoomAccess), sessionCookie(member))
    await waitForConnect(client)

    const ack = await client.emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, {
      workspaceId: workspace.id,
    })
    expect(ack).toEqual({ ok: true, data: null })

    const update = new Promise((resolve) => {
      client.once(SERVER_EVENTS.WORKSPACE_UPDATED, resolve)
    })
    realtime.emit(rooms.workspace(workspace.id), SERVER_EVENTS.WORKSPACE_UPDATED, {
      workspaceId: workspace.id,
    })
    await expect(update).resolves.toEqual({ workspaceId: workspace.id })

    const notification = new Promise((resolve) => {
      client.once(SERVER_EVENTS.NOTIFICATION_CREATED, resolve)
    })
    realtime.emit(rooms.user(member.id), SERVER_EVENTS.NOTIFICATION_CREATED, {
      notificationId: workspace.id,
    })
    await expect(notification).resolves.toEqual({ notificationId: workspace.id })
  })

  it('refuses workspace rooms to non-members', async () => {
    const { workspace } = await workspaceFixture()
    const outsider = await createUser()
    const client = createClient(await startServer(membershipRoomAccess), sessionCookie(outsider))
    await waitForConnect(client)

    const ack = await client.emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, {
      workspaceId: workspace.id,
    })
    expect(!ack.ok && ack.error.code).toBe('FORBIDDEN')
  })

  it('applies the channel rules: private channels need membership (or admin oversight)', async () => {
    const { owner, member, workspace, privateChannel } = await workspaceFixture()
    const url = await startServer(membershipRoomAccess)
    const payload = { workspaceId: workspace.id, channelId: privateChannel.id }

    const memberClient = createClient(url, sessionCookie(member))
    await waitForConnect(memberClient)
    const denied = await memberClient.emitWithAck(CLIENT_EVENTS.CHANNEL_JOIN, payload)
    expect(!denied.ok && denied.error.code).toBe('FORBIDDEN')

    const ownerClient = createClient(url, sessionCookie(owner))
    await waitForConnect(ownerClient)
    expect(await ownerClient.emitWithAck(CLIENT_EVENTS.CHANNEL_JOIN, payload)).toEqual({
      ok: true,
      data: null,
    })
  })

  it('validates join payloads', async () => {
    const user = await createUser()
    const client = createClient(await startServer(membershipRoomAccess), sessionCookie(user))
    await waitForConnect(client)

    const ack = await client.emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, { workspaceId: '' })
    expect(!ack.ok && ack.error.code).toBe('VALIDATION_ERROR')
  })
})
