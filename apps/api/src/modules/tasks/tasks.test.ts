import type { MoveTaskResponse, Task, TaskLabel, TaskSearchResult } from '@syncspace/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { getPrisma } from '@/lib/prisma'
import { uniqueSlug } from '@/test/helpers'
import {
  boardWithColumns,
  createLabelAs,
  createTaskAs,
  getBoardDetail,
  type TaskWorkspace,
  taskWorkspace,
  titlesByColumn,
} from '@/test/task-fixtures'

let ws: TaskWorkspace

beforeEach(async () => {
  ws = await taskWorkspace()
})

describe('tasks', () => {
  it('creates a task with priority, due date, assignees and labels at the bottom of its column', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const label = await createLabelAs(ws.owner.agent, ws.base, 'Bug', '#ef4444')
    const first = await createTaskAs(ws.member.agent, board.id, {
      columnId: todo.id,
      title: 'First',
    })
    const task = await createTaskAs(ws.member.agent, board.id, {
      columnId: todo.id,
      title: '  Second  ',
      description: 'Line one\nLine two',
      priority: 'URGENT',
      dueDate: '2026-12-01T22:59:59.999Z',
      assigneeIds: [ws.owner.user.id, ws.member.user.id],
      labelIds: [label.id],
    })
    expect(task).toMatchObject({
      title: 'Second',
      description: 'Line one\nLine two',
      priority: 'URGENT',
      dueDate: '2026-12-01T22:59:59.999Z',
      completedAt: null,
      archivedAt: null,
      columnId: todo.id,
      createdBy: { id: ws.member.user.id },
      labels: [{ id: label.id, name: 'Bug', color: '#EF4444' }],
      attachments: [],
    })
    expect(task.assignees.map((a) => a.id).sort()).toEqual(
      [ws.owner.user.id, ws.member.user.id].sort(),
    )
    expect(task.position).toBeGreaterThan(first.position)
    expect(first.priority).toBe('MEDIUM')
  })

  it('validates assignees, labels and columns against the workspace and board', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const prisma = getPrisma()
    const otherWorkspace = await prisma.workspace.create({
      data: {
        name: 'Other',
        slug: uniqueSlug('other'),
        ownerId: ws.outsider.user.id,
        members: { create: { userId: ws.outsider.user.id, role: 'OWNER' } },
      },
    })
    const foreignLabel = await prisma.taskLabel.create({
      data: { workspaceId: otherWorkspace.id, name: 'Foreign', color: '#000000' },
    })
    const task = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'T' })

    const responses = await Promise.all([
      ws.owner.agent
        .post(`/boards/${board.id}/tasks`)
        .send({ columnId: todo.id, title: 'x', assigneeIds: [ws.outsider.user.id] }),
      ws.owner.agent
        .post(`/boards/${board.id}/tasks`)
        .send({ columnId: todo.id, title: 'x', labelIds: [foreignLabel.id] }),
      ws.owner.agent.put(`/tasks/${task.id}/assignees`).send({ userIds: [ws.outsider.user.id] }),
      ws.owner.agent.put(`/tasks/${task.id}/labels`).send({ labelIds: [foreignLabel.id] }),
      ws.owner.agent.post(`/boards/${board.id}/tasks`).send({ columnId: todo.id, title: '   ' }),
    ])
    expect(responses.map((r) => r.status)).toEqual([400, 400, 400, 400, 400])
  })

  it('edits fields, completes and reopens without changing columns', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const task = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'Draft' })

    const edited = await ws.member.agent
      .patch(`/tasks/${task.id}`)
      .send({
        title: 'Final',
        description: 'Notes',
        priority: 'HIGH',
        dueDate: '2026-11-20T10:00:00.000Z',
      })
      .expect(200)
    expect(edited.body).toMatchObject({ title: 'Final', description: 'Notes', priority: 'HIGH' })

    const completed = await ws.member.agent
      .patch(`/tasks/${task.id}`)
      .send({ completed: true })
      .expect(200)
    expect((completed.body as Task).completedAt).not.toBeNull()
    expect((completed.body as Task).columnId).toBe(todo.id)

    const cleared = await ws.member.agent
      .patch(`/tasks/${task.id}`)
      .send({ completed: false, dueDate: null, description: '   ' })
      .expect(200)
    expect(cleared.body).toMatchObject({ completedAt: null, dueDate: null, description: null })

    await ws.member.agent.patch(`/tasks/${task.id}`).send({}).expect(400)
    await ws.member.agent.patch(`/tasks/${task.id}`).send({ priority: 'CRITICAL' }).expect(400)
  })

  it('moves tasks between columns and reorders within a column', async () => {
    const { board, todo, doing } = await boardWithColumns(ws.owner.agent, ws.base)
    const a = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'A' })
    const b = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'B' })
    const c = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'C' })

    // C to the top of To Do.
    const top = await ws.member.agent
      .post(`/tasks/${c.id}/move`)
      .send({ columnId: todo.id, afterTaskId: null })
      .expect(200)
    expect((top.body as MoveTaskResponse).placements).toHaveLength(1)

    // A after B (same column), then B into In Progress.
    await ws.member.agent
      .post(`/tasks/${a.id}/move`)
      .send({ columnId: todo.id, afterTaskId: b.id })
      .expect(200)
    const moved = await ws.member.agent
      .post(`/tasks/${b.id}/move`)
      .send({ columnId: doing.id, afterTaskId: null })
      .expect(200)
    expect((moved.body as MoveTaskResponse).task.columnId).toBe(doing.id)

    const detail = await getBoardDetail(ws.owner.agent, ws.base, board.id)
    expect(titlesByColumn(detail)).toEqual({ 'To Do': ['C', 'A'], 'In Progress': ['B'], Done: [] })

    const invalid = await Promise.all([
      ws.member.agent.post(`/tasks/${a.id}/move`).send({ columnId: todo.id, afterTaskId: a.id }),
      ws.member.agent.post(`/tasks/${a.id}/move`).send({ columnId: todo.id, afterTaskId: b.id }),
    ])
    expect(invalid.map((r) => r.status)).toEqual([400, 400])
  })

  it('rebalances a column when positions run out of precision', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const a = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'A' })
    const b = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'B' })
    const c = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'C' })
    const prisma = getPrisma()
    await prisma.task.update({ where: { id: a.id }, data: { position: 5 } })
    await prisma.task.update({ where: { id: b.id }, data: { position: 5.0000000001 } })

    const response = await ws.owner.agent
      .post(`/tasks/${c.id}/move`)
      .send({ columnId: todo.id, afterTaskId: a.id })
      .expect(200)
    const { placements } = response.body as MoveTaskResponse
    expect(placements.map((p) => [p.taskId, p.position])).toEqual([
      [a.id, 1024],
      [c.id, 2048],
      [b.id, 3072],
    ])
    const detail = await getBoardDetail(ws.owner.agent, ws.base, board.id)
    expect(titlesByColumn(detail)['To Do']).toEqual(['A', 'C', 'B'])
  })

  it('archives and restores tasks without losing them', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const task = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'Old' })

    await ws.member.agent.post(`/tasks/${task.id}/archive`).expect(200)
    let detail = await getBoardDetail(ws.member.agent, ws.base, board.id)
    expect(detail.tasks).toHaveLength(0)
    const archived = await ws.member.agent
      .get(`${ws.base}/boards/${board.id}/archived-tasks`)
      .expect(200)
    expect((archived.body as { items: Task[] }).items.map((t) => t.id)).toEqual([task.id])
    await ws.member.agent
      .post(`/tasks/${task.id}/move`)
      .send({ columnId: todo.id, afterTaskId: null })
      .expect(409)
    // Still readable directly (e.g. from a notification).
    await ws.member.agent.get(`/tasks/${task.id}`).expect(200)

    await ws.member.agent.post(`/tasks/${task.id}/restore`).expect(200)
    detail = await getBoardDetail(ws.member.agent, ws.base, board.id)
    expect(detail.tasks.map((t) => t.id)).toEqual([task.id])
  })

  it('replaces assignees and labels', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const bug = await createLabelAs(ws.owner.agent, ws.base, 'Bug')
    const ux = await createLabelAs(ws.owner.agent, ws.base, 'UX', '#3b82f6')
    const task = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'T' })

    const assigned = await ws.member.agent
      .put(`/tasks/${task.id}/assignees`)
      .send({ userIds: [ws.member.user.id, ws.admin.user.id] })
      .expect(200)
    expect((assigned.body as Task).assignees).toHaveLength(2)
    const reduced = await ws.member.agent
      .put(`/tasks/${task.id}/assignees`)
      .send({ userIds: [ws.admin.user.id] })
      .expect(200)
    expect((reduced.body as Task).assignees.map((a) => a.id)).toEqual([ws.admin.user.id])

    const labelled = await ws.member.agent
      .put(`/tasks/${task.id}/labels`)
      .send({ labelIds: [ux.id, bug.id] })
      .expect(200)
    expect((labelled.body as Task).labels.map((l) => l.name)).toEqual(['Bug', 'UX'])
    await ws.member.agent.put(`/tasks/${task.id}/labels`).send({ labelIds: [] }).expect(200)
  })

  it('searches active task titles and descriptions in the workspace', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base, 'Platform')
    await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'Fix login redirect' })
    await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo.id,
      title: 'Session cleanup',
      description: 'Also check the LOGIN cookie flags',
    })
    const archived = await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo.id,
      title: 'Old login',
    })
    await ws.owner.agent.post(`/tasks/${archived.id}/archive`).expect(200)

    const response = await ws.member.agent.get(`${ws.base}/tasks/search?q=login`).expect(200)
    const items = (response.body as { items: TaskSearchResult[] }).items
    expect(items.map((i) => i.title).sort()).toEqual(['Fix login redirect', 'Session cleanup'])
    expect(items.find((i) => i.title === 'Session cleanup')?.snippet).toMatch(/LOGIN cookie/)
    expect(items[0]?.boardName).toBe('Platform')

    await ws.outsider.agent.get(`${ws.base}/tasks/search?q=login`).expect(404)
  })
})

describe('labels', () => {
  it('lets admins manage labels and members apply them', async () => {
    await ws.member.agent
      .post(`${ws.base}/task-labels`)
      .send({ name: 'Mine', color: '#112233' })
      .expect(403)
    const label = await createLabelAs(ws.admin.agent, ws.base, 'Design', '#a855f7')
    expect(label.color).toBe('#A855F7')

    await ws.admin.agent
      .post(`${ws.base}/task-labels`)
      .send({ name: 'Design', color: '#000000' })
      .expect(409)
    await ws.admin.agent
      .post(`${ws.base}/task-labels`)
      .send({ name: 'Bad', color: 'red' })
      .expect(400)
    await ws.member.agent.patch(`/task-labels/${label.id}`).send({ name: 'x' }).expect(403)

    const renamed = await ws.owner.agent
      .patch(`/task-labels/${label.id}`)
      .send({ name: 'UI' })
      .expect(200)
    expect((renamed.body as TaskLabel).name).toBe('UI')

    const { board, todo } = await boardWithColumns(ws.member.agent, ws.base)
    const task = await createTaskAs(ws.member.agent, board.id, {
      columnId: todo.id,
      title: 'Styled',
      labelIds: [label.id],
    })
    expect(task.labels).toHaveLength(1)

    await ws.owner.agent.delete(`/task-labels/${label.id}`).expect(204)
    const after = await ws.member.agent.get(`/tasks/${task.id}`).expect(200)
    expect((after.body as Task).labels).toEqual([])
    const list = await ws.member.agent.get(`${ws.base}/task-labels`).expect(200)
    expect((list.body as { items: TaskLabel[] }).items).toEqual([])

    await ws.outsider.agent.patch(`/task-labels/${label.id}`).send({ name: 'x' }).expect(404)
  })
})
