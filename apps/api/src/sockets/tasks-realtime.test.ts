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
import { openDm, postMessage } from '@/test/chat-fixtures'
import { sessionCookie } from '@/test/helpers'
import {
  boardWithColumns,
  createBoardAs,
  createTaskAs,
  type TaskWorkspace,
  taskWorkspace,
} from '@/test/task-fixtures'

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

function arrives(client: TestClient, event: EventName, ms = 400): Promise<boolean> {
  return next(client, event, ms).then(
    () => true,
    () => false,
  )
}

async function inWorkspace(ws: TaskWorkspace, user: { id: string; tokenVersion: number }) {
  const client = await connectAs(user)
  const ack = await client.emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, {
    workspaceId: ws.workspace.id,
  })
  expect(ack.ok).toBe(true)
  return client
}

describe('board and task realtime', () => {
  it('broadcasts board, column and task changes to the workspace room only', async () => {
    const ws = await taskWorkspace()
    const member = await inWorkspace(ws, ws.member.user)
    const outsider = await connectAs(ws.outsider.user)

    const boardCreated = next(member, SERVER_EVENTS.BOARD_CREATED)
    const board = await createBoardAs(ws.owner.agent, ws.base, 'Live')
    expect((await boardCreated).board).toMatchObject({ id: board.id, columnCount: 3 })

    const columns = next(member, SERVER_EVENTS.COLUMNS_UPDATED)
    await ws.owner.agent.post(`/boards/${board.id}/columns`).send({ name: 'QA' }).expect(201)
    expect((await columns).columns.map((c) => c.name)).toEqual([
      'To Do',
      'In Progress',
      'Done',
      'QA',
    ])
    const [todo, doing] = (await columns).columns

    const created = next(member, SERVER_EVENTS.TASK_CREATED)
    const task = await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo?.id ?? '',
      title: 'Ship',
    })
    expect((await created).task).toMatchObject({ id: task.id, title: 'Ship' })

    const updated = next(member, SERVER_EVENTS.TASK_UPDATED)
    await ws.owner.agent.patch(`/tasks/${task.id}`).send({ priority: 'HIGH' }).expect(200)
    expect((await updated).task.priority).toBe('HIGH')

    const moved = next(member, SERVER_EVENTS.TASK_MOVED)
    await ws.owner.agent
      .post(`/tasks/${task.id}/move`)
      .send({ columnId: doing?.id, afterTaskId: null })
      .expect(200)
    expect(await moved).toMatchObject({
      boardId: board.id,
      placements: [{ taskId: task.id, columnId: doing?.id }],
    })

    const archived = next(member, SERVER_EVENTS.BOARD_UPDATED)
    await ws.owner.agent.post(`${ws.base}/boards/${board.id}/archive`).expect(200)
    expect((await archived).board.archivedAt).not.toBeNull()

    const labels = next(member, SERVER_EVENTS.LABELS_UPDATED)
    await ws.owner.agent
      .post(`${ws.base}/task-labels`)
      .send({ name: 'Bug', color: '#FF0000' })
      .expect(201)
    expect((await labels).labels.map((l) => l.name)).toEqual(['Bug'])

    expect(await arrives(outsider, SERVER_EVENTS.TASK_CREATED)).toBe(false)
  })
})

describe('attachment realtime', () => {
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16, 1),
  ])

  it('delivers message and task attachments in the realtime payloads', async () => {
    const ws = await taskWorkspace()
    const member = await inWorkspace(ws, ws.member.user)

    const created = next(member, SERVER_EVENTS.MESSAGE_CREATED)
    await ws.owner.agent
      .post(`${ws.base}/channels/${ws.general.id}/messages`)
      .field('content', 'screenshot')
      .attach('files', PNG, { filename: 'screen.png', contentType: 'image/png' })
      .expect(201)
    expect((await created).message.attachments).toEqual([
      expect.objectContaining({ fileName: 'screen.png', mimeType: 'image/png' }),
    ])

    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const task = await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo.id,
      title: 'With file',
    })
    const updated = next(member, SERVER_EVENTS.TASK_UPDATED)
    await ws.owner.agent
      .post(`/tasks/${task.id}/attachments`)
      .attach('files', PNG, { filename: 'mock.png', contentType: 'image/png' })
      .expect(201)
    expect((await updated).task.attachments.map((a) => a.fileName)).toEqual(['mock.png'])
  })
})

describe('notification realtime', () => {
  it('pushes assignment notifications with the unread count to the assignee only', async () => {
    const ws = await taskWorkspace()
    const member = await connectAs(ws.member.user)
    const admin = await connectAs(ws.admin.user)
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)

    const pushed = next(member, SERVER_EVENTS.NOTIFICATION_CREATED)
    const task = await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo.id,
      title: 'Review PR',
      assigneeIds: [ws.member.user.id],
    })
    expect(await pushed).toMatchObject({
      unreadCount: 1,
      notification: {
        type: 'TASK_ASSIGNED',
        link: { kind: 'task', boardId: board.id, taskId: task.id },
      },
    })
    expect(await arrives(admin, SERVER_EVENTS.NOTIFICATION_CREATED)).toBe(false)

    const notificationId = (await pushed).notification.id
    const updated = next(member, SERVER_EVENTS.NOTIFICATION_UPDATED)
    await ws.member.agent.post(`/notifications/${notificationId}/read`).expect(200)
    expect(await updated).toMatchObject({ unreadCount: 0, notification: { id: notificationId } })

    const readAll = next(member, SERVER_EVENTS.NOTIFICATIONS_READ)
    await ws.member.agent.post('/notifications/read-all').expect(200)
    expect((await readAll).unreadCount).toBe(0)
  })

  it('does not notify DM participants who have the conversation open', async () => {
    const ws = await taskWorkspace()
    const dm = await openDm(ws.member.agent, ws.base, ws.owner.user.id)
    const owner = await inWorkspace(ws, ws.owner.user)
    const ack = await owner.emitWithAck(CLIENT_EVENTS.CONVERSATION_JOIN, {
      workspaceId: ws.workspace.id,
      conversationId: dm.id,
    })
    expect(ack.ok).toBe(true)

    const notified = arrives(owner, SERVER_EVENTS.NOTIFICATION_CREATED, 600)
    await postMessage(ws.member.agent, `${ws.base}/conversations/${dm.id}`, 'You there?')
    expect(await notified).toBe(false)

    await owner.emitWithAck(CLIENT_EVENTS.CONVERSATION_LEAVE, {
      workspaceId: ws.workspace.id,
      conversationId: dm.id,
    })
    const pushed = next(owner, SERVER_EVENTS.NOTIFICATION_CREATED)
    await postMessage(ws.member.agent, `${ws.base}/conversations/${dm.id}`, 'Hello?')
    expect((await pushed).notification).toMatchObject({ type: 'MESSAGE', body: 'Hello?' })
  })
})
