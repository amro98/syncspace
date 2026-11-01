import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  CLIENT_EVENTS,
  type ClientToServerEvents,
  SERVER_EVENTS,
  type ServerToClientEvents,
} from '@syncspace/shared'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '@/app'
import {
  type ChatWorkspace,
  chatWorkspace,
  createChannelAs,
  openDm,
  postMessage,
} from '@/test/chat-fixtures'
import { sessionCookie } from '@/test/helpers'

import { createSocketServer, realtime } from './index'
import { presence } from './presence'
import { membershipRoomAccess } from './room-access'
import type { TypedServer } from './types'

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>
type EventName = keyof ServerToClientEvents

let httpServer: HttpServer | undefined
let io: TypedServer | undefined
let url = ''
const clients: TestClient[] = []

beforeEach(async () => {
  httpServer = createServer(createApp())
  io = createSocketServer(httpServer, { roomAccess: membershipRoomAccess, presenceGraceMs: 0 })
  realtime.attach(io)
  await new Promise<void>((resolve) => httpServer?.listen(0, resolve))
  url = `http://localhost:${String((httpServer.address() as AddressInfo).port)}`
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  realtime.detach()
  await io?.close()
  presence.reset()
})

async function connectAs(user: { id: string; tokenVersion: number }): Promise<TestClient> {
  const client: TestClient = connect(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: { cookie: sessionCookie(user) },
  })
  clients.push(client)
  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => {
      resolve()
    })
    client.once('connect_error', reject)
  })
  return client
}

/** Resolves with the next `event` payload (or rejects after a timeout). */
function next<E extends EventName>(client: TestClient, event: E, timeoutMs = 3000) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for ${event}`))
    }, timeoutMs)
    client.once(event, ((payload: unknown) => {
      clearTimeout(timer)
      resolve(payload as Parameters<ServerToClientEvents[E]>[0])
    }) as never)
  })
}

/** Resolves true if `event` arrives within `ms`, false otherwise. */
function arrives(client: TestClient, event: EventName, ms = 400): Promise<boolean> {
  return next(client, event, ms).then(
    () => true,
    () => false,
  )
}

async function joinWorkspace(client: TestClient, ws: ChatWorkspace) {
  const ack = await client.emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, {
    workspaceId: ws.workspace.id,
  })
  expect(ack.ok).toBe(true)
}

describe('message delivery', () => {
  it('delivers public channel messages to workspace members (sidebar) with the sender’s clientMessageId', async () => {
    const ws = await chatWorkspace()
    const member = await connectAs(ws.member.user)
    await joinWorkspace(member, ws)

    const received = next(member, SERVER_EVENTS.MESSAGE_CREATED)
    const clientMessageId = crypto.randomUUID()
    const sent = await postMessage(
      ws.owner.agent,
      `${ws.base}/channels/${ws.general.id}`,
      'hello all',
      {
        clientMessageId,
      },
    )
    const payload = await received
    expect(payload).toMatchObject({
      clientMessageId,
      parent: null,
      message: { id: sent.id, content: 'hello all' },
    })
  })

  it('delivers reactions and edits', async () => {
    const ws = await chatWorkspace()
    const member = await connectAs(ws.member.user)
    await joinWorkspace(member, ws)
    const message = await postMessage(
      ws.owner.agent,
      `${ws.base}/channels/${ws.general.id}`,
      'react to me',
    )

    const reaction = next(member, SERVER_EVENTS.REACTION_UPDATED)
    await ws.owner.agent.post(`/messages/${message.id}/reactions`).send({ emoji: '🔥' }).expect(200)
    expect(await reaction).toMatchObject({
      messageId: message.id,
      reactions: [{ emoji: '🔥', count: 1 }],
    })

    const edit = next(member, SERVER_EVENTS.MESSAGE_UPDATED)
    await ws.owner.agent.patch(`/messages/${message.id}`).send({ content: 'edited' }).expect(200)
    expect((await edit).message).toMatchObject({ id: message.id, content: 'edited' })
  })

  it('delivers thread replies with the parent’s new reply count', async () => {
    const ws = await chatWorkspace()
    const owner = await connectAs(ws.owner.user)
    await joinWorkspace(owner, ws)
    const parent = await postMessage(
      ws.owner.agent,
      `${ws.base}/channels/${ws.general.id}`,
      'thread me',
    )

    const reply = next(owner, SERVER_EVENTS.MESSAGE_CREATED)
    await ws.member.agent
      .post(`/messages/${parent.id}/replies`)
      .send({ content: 'reply!' })
      .expect(201)
    expect(await reply).toMatchObject({
      message: { parentMessageId: parent.id },
      parent: { id: parent.id, replyCount: 1 },
    })
  })

  it('delivers DMs only to participants', async () => {
    const ws = await chatWorkspace()
    const member = await connectAs(ws.member.user)
    const admin = await connectAs(ws.admin.user)
    await joinWorkspace(member, ws)
    await joinWorkspace(admin, ws)

    const dm = await openDm(ws.owner.agent, ws.base, ws.member.user.id)
    const toMember = next(member, SERVER_EVENTS.MESSAGE_CREATED)
    const toAdmin = arrives(admin, SERVER_EVENTS.MESSAGE_CREATED)
    await postMessage(ws.owner.agent, `${ws.base}/conversations/${dm.id}`, 'psst')

    expect((await toMember).message.destination).toEqual({ kind: 'conversation', id: dm.id })
    expect(await toAdmin).toBe(false)
  })
})

describe('rooms', () => {
  it('lets participants join a conversation room and refuses others', async () => {
    const ws = await chatWorkspace()
    const dm = await openDm(ws.owner.agent, ws.base, ws.member.user.id)
    const member = await connectAs(ws.member.user)
    const admin = await connectAs(ws.admin.user)
    const payload = { workspaceId: ws.workspace.id, conversationId: dm.id }

    expect(await member.emitWithAck(CLIENT_EVENTS.CONVERSATION_JOIN, payload)).toEqual({
      ok: true,
      data: null,
    })
    const denied = await admin.emitWithAck(CLIENT_EVENTS.CONVERSATION_JOIN, payload)
    expect(!denied.ok && denied.error.code).toBe('FORBIDDEN')
  })

  it('removes a member from a private channel’s room and audience immediately', async () => {
    const ws = await chatWorkspace()
    const secret = await createChannelAs(ws.owner.agent, ws.base, {
      name: 'secret',
      type: 'PRIVATE',
    })
    await ws.owner.agent
      .post(`${ws.base}/channels/${secret.id}/members`)
      .send({ userId: ws.member.user.id })
      .expect(201)

    const member = await connectAs(ws.member.user)
    await joinWorkspace(member, ws)
    const join = await member.emitWithAck(CLIENT_EVENTS.CHANNEL_JOIN, {
      workspaceId: ws.workspace.id,
      channelId: secret.id,
    })
    expect(join.ok).toBe(true)

    const removed = next(member, SERVER_EVENTS.CHANNEL_REMOVED)
    await ws.owner.agent
      .delete(`${ws.base}/channels/${secret.id}/members/${ws.member.user.id}`)
      .expect(204)
    expect(await removed).toEqual({ workspaceId: ws.workspace.id, channelId: secret.id })

    const leak = arrives(member, SERVER_EVENTS.MESSAGE_CREATED)
    await postMessage(ws.owner.agent, `${ws.base}/channels/${secret.id}`, 'after removal')
    expect(await leak).toBe(false)

    const rejoin = await member.emitWithAck(CLIENT_EVENTS.CHANNEL_JOIN, {
      workspaceId: ws.workspace.id,
      channelId: secret.id,
    })
    expect(rejoin.ok).toBe(false)
  })

  it('announces newly visible private channels to the added member', async () => {
    const ws = await chatWorkspace()
    const member = await connectAs(ws.member.user)
    const secret = await createChannelAs(ws.owner.agent, ws.base, { name: 'vip', type: 'PRIVATE' })

    const granted = next(member, SERVER_EVENTS.CHANNEL_CREATED)
    await ws.owner.agent
      .post(`${ws.base}/channels/${secret.id}/members`)
      .send({ userId: ws.member.user.id })
      .expect(201)
    expect((await granted).channel).toMatchObject({ id: secret.id, type: 'PRIVATE' })
  })
})

describe('typing', () => {
  it('broadcasts typers to the destination room and expires on stop', async () => {
    const ws = await chatWorkspace()
    const owner = await connectAs(ws.owner.user)
    const member = await connectAs(ws.member.user)
    const room = { workspaceId: ws.workspace.id, channelId: ws.general.id }
    await owner.emitWithAck(CLIENT_EVENTS.CHANNEL_JOIN, room)
    await member.emitWithAck(CLIENT_EVENTS.CHANNEL_JOIN, room)
    const destination = { kind: 'channel' as const, id: ws.general.id }

    const started = next(member, SERVER_EVENTS.TYPING_UPDATED)
    owner.emit(CLIENT_EVENTS.TYPING_START, { destination })
    expect(await started).toEqual({ destination, userIds: [ws.owner.user.id] })

    const stopped = next(member, SERVER_EVENTS.TYPING_UPDATED)
    owner.emit(CLIENT_EVENTS.TYPING_STOP, { destination })
    expect(await stopped).toEqual({ destination, userIds: [] })
  })

  it('ignores typing from sockets that have not joined the destination', async () => {
    const ws = await chatWorkspace()
    const member = await connectAs(ws.member.user)
    const outsider = await connectAs(ws.outsider.user)
    await member.emitWithAck(CLIENT_EVENTS.CHANNEL_JOIN, {
      workspaceId: ws.workspace.id,
      channelId: ws.general.id,
    })

    const leaked = arrives(member, SERVER_EVENTS.TYPING_UPDATED)
    outsider.emit(CLIENT_EVENTS.TYPING_START, {
      destination: { kind: 'channel', id: ws.general.id },
    })
    expect(await leaked).toBe(false)
  })
})

describe('presence', () => {
  it('goes online on first connection and offline only after the last tab closes', async () => {
    const ws = await chatWorkspace()
    const watcher = await connectAs(ws.member.user)
    await joinWorkspace(watcher, ws)

    const online = next(watcher, SERVER_EVENTS.PRESENCE_UPDATED)
    const tabOne = await connectAs(ws.owner.user)
    expect(await online).toMatchObject({ userId: ws.owner.user.id, status: 'online' })

    const tabTwo = await connectAs(ws.owner.user)
    const prematureOffline = arrives(watcher, SERVER_EVENTS.PRESENCE_UPDATED)
    tabOne.disconnect()
    expect(await prematureOffline).toBe(false)

    const offline = next(watcher, SERVER_EVENTS.PRESENCE_UPDATED)
    tabTwo.disconnect()
    expect(await offline).toMatchObject({ userId: ws.owner.user.id, status: 'offline' })

    const members = await ws.member.agent.get(`${ws.base}/members`).expect(200)
    const owner = (
      members.body as { items: { id: string; online: boolean; lastSeenAt: string | null }[] }
    ).items.find((m) => m.id === ws.owner.user.id)
    expect(owner).toMatchObject({ online: false, lastSeenAt: expect.any(String) })
  })
})
