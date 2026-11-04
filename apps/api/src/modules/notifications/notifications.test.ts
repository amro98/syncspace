import type { Notification, NotificationPage } from '@syncspace/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { getPrisma } from '@/lib/prisma'
import { openDm, postMessage } from '@/test/chat-fixtures'
import {
  boardWithColumns,
  createTaskAs,
  type TaskWorkspace,
  taskWorkspace,
} from '@/test/task-fixtures'
import type { Agent } from '@/test/helpers'

let ws: TaskWorkspace

beforeEach(async () => {
  ws = await taskWorkspace()
})

async function inbox(agent: Agent, query = ''): Promise<NotificationPage> {
  const response = await agent.get(`/notifications${query}`).expect(200)
  return response.body as NotificationPage
}

describe('notifications', () => {
  it('notifies newly assigned people (never the actor) with a link to the task', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base, 'Ops')
    const task = await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo.id,
      title: 'Rotate keys',
      assigneeIds: [ws.member.user.id, ws.owner.user.id],
    })

    const page = await inbox(ws.member.agent)
    expect(page.unreadCount).toBe(1)
    expect(page.items[0]).toMatchObject({
      type: 'TASK_ASSIGNED',
      title: `${ws.owner.user.name} assigned you a task`,
      body: 'Rotate keys',
      workspace: { id: ws.workspace.id, name: ws.workspace.name },
      actor: { id: ws.owner.user.id },
      entityType: 'TASK',
      entityId: task.id,
      link: { kind: 'task', workspaceId: ws.workspace.id, boardId: board.id, taskId: task.id },
      readAt: null,
    })
    // Self-assignment does not notify.
    expect((await inbox(ws.owner.agent)).items).toEqual([])

    // Re-sending the same assignee set does not notify again; adding someone does.
    await ws.owner.agent
      .put(`/tasks/${task.id}/assignees`)
      .send({ userIds: [ws.member.user.id, ws.owner.user.id, ws.admin.user.id] })
      .expect(200)
    expect((await inbox(ws.member.agent)).items).toHaveLength(1)
    expect((await inbox(ws.admin.agent)).items).toHaveLength(1)

    // Assigning yourself later is silent too.
    const solo = await createTaskAs(ws.member.agent, board.id, { columnId: todo.id, title: 'Solo' })
    await ws.member.agent
      .put(`/tasks/${solo.id}/assignees`)
      .send({ userIds: [ws.member.user.id] })
      .expect(200)
    expect((await inbox(ws.member.agent)).items).toHaveLength(1)
  })

  it('tells assignees when someone else completes their task', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const task = await createTaskAs(ws.member.agent, board.id, {
      columnId: todo.id,
      title: 'Write docs',
      assigneeIds: [ws.member.user.id],
    })
    await ws.owner.agent.patch(`/tasks/${task.id}`).send({ completed: true }).expect(200)
    const page = await inbox(ws.member.agent)
    expect(page.items[0]).toMatchObject({ type: 'TASK_UPDATED', body: 'Write docs' })
  })

  it('notifies DM recipients once per unread conversation', async () => {
    const dm = await openDm(ws.member.agent, ws.base, ws.owner.user.id)
    const path = `${ws.base}/conversations/${dm.id}`
    await postMessage(ws.member.agent, path, 'Ping')
    await postMessage(ws.member.agent, path, 'Ping again')

    let page = await inbox(ws.owner.agent)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      type: 'MESSAGE',
      title: `New message from ${ws.member.user.name}`,
      body: 'Ping',
      link: { kind: 'destination', destination: { kind: 'conversation', id: dm.id } },
    })
    // Channel messages do not notify.
    await postMessage(ws.member.agent, `${ws.base}/channels/${ws.general.id}`, 'Hello all')
    expect((await inbox(ws.owner.agent)).items).toHaveLength(1)

    // Once read, the next message notifies again.
    await ws.owner.agent.post(`/notifications/${page.items[0]?.id ?? ''}/read`).expect(200)
    await postMessage(ws.member.agent, path, 'Ping three')
    page = await inbox(ws.owner.agent, '?filter=unread')
    expect(page.items.map((n) => n.body)).toEqual(['Ping three'])
  })

  it('isolates inboxes and supports read, unread and read-all', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    for (const title of ['One', 'Two', 'Three']) {
      await createTaskAs(ws.owner.agent, board.id, {
        columnId: todo.id,
        title,
        assigneeIds: [ws.member.user.id],
      })
    }
    const [newest] = (await inbox(ws.member.agent)).items
    if (!newest) throw new Error('missing notification')

    // Nobody else can see or change it.
    await ws.admin.agent.post(`/notifications/${newest.id}/read`).expect(404)
    expect((await inbox(ws.admin.agent)).items).toEqual([])

    const read = await ws.member.agent.post(`/notifications/${newest.id}/read`).expect(200)
    expect((read.body as Notification).readAt).not.toBeNull()
    let count = await ws.member.agent.get('/notifications/unread-count').expect(200)
    expect(count.body).toEqual({ unreadCount: 2 })

    const unread = await ws.member.agent
      .post(`/notifications/${newest.id}/read`)
      .send({ read: false })
      .expect(200)
    expect((unread.body as Notification).readAt).toBeNull()

    await ws.member.agent.post('/notifications/read-all').expect(200)
    count = await ws.member.agent.get('/notifications/unread-count').expect(200)
    expect(count.body).toEqual({ unreadCount: 0 })
    expect((await inbox(ws.member.agent, '?filter=unread')).items).toEqual([])
  })

  it('paginates newest first with a cursor', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    for (let i = 1; i <= 5; i += 1) {
      await createTaskAs(ws.owner.agent, board.id, {
        columnId: todo.id,
        title: `Task ${String(i)}`,
        assigneeIds: [ws.member.user.id],
      })
    }
    const first = await inbox(ws.member.agent, '?limit=2')
    expect(first.items.map((n) => n.body)).toEqual(['Task 5', 'Task 4'])
    expect(first.nextCursor).not.toBeNull()
    const second = await inbox(ws.member.agent, `?limit=2&cursor=${first.nextCursor ?? ''}`)
    expect(second.items.map((n) => n.body)).toEqual(['Task 3', 'Task 2'])
    const third = await inbox(ws.member.agent, `?limit=2&cursor=${second.nextCursor ?? ''}`)
    expect(third.items.map((n) => n.body)).toEqual(['Task 1'])
    expect(third.nextCursor).toBeNull()
  })

  it('returns a null link once the target is gone', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const task = await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo.id,
      title: 'Temporary',
      assigneeIds: [ws.member.user.id],
    })
    await getPrisma().task.delete({ where: { id: task.id } })
    const [notification] = (await inbox(ws.member.agent)).items
    expect(notification?.link).toBeNull()
  })

  it('tells the inviter when an invitation is accepted', async () => {
    const { notifyInviteAccepted } = await import('./triggers')
    await notifyInviteAccepted(
      {
        createdById: ws.owner.user.id,
        workspace: { id: ws.workspace.id, name: ws.workspace.name },
      },
      ws.member.user.id,
    )
    const [notification] = (await inbox(ws.owner.agent)).items
    expect(notification).toMatchObject({
      type: 'INVITE',
      title: `${ws.member.user.name} joined ${ws.workspace.name}`,
      link: { kind: 'workspace', workspaceId: ws.workspace.id },
    })
  })
})
