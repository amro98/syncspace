import type { Board, BoardColumn } from '@syncspace/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { getPrisma } from '@/lib/prisma'
import {
  boardWithColumns,
  createBoardAs,
  createTaskAs,
  getBoardDetail,
  type TaskWorkspace,
  taskWorkspace,
} from '@/test/task-fixtures'

let ws: TaskWorkspace

beforeEach(async () => {
  ws = await taskWorkspace()
})

describe('boards', () => {
  it('creates a board with To Do / In Progress / Done and lists it', async () => {
    const board = await createBoardAs(ws.member.agent, ws.base, 'Launch')
    expect(board).toMatchObject({
      name: 'Launch',
      archivedAt: null,
      columnCount: 3,
      taskCount: 0,
      createdBy: { id: ws.member.user.id, name: ws.member.user.name },
    })
    expect(board.createdBy).not.toHaveProperty('email')

    const detail = await getBoardDetail(ws.owner.agent, ws.base, board.id)
    expect(detail.columns.map((c) => c.name)).toEqual(['To Do', 'In Progress', 'Done'])
    const positions = detail.columns.map((c) => c.position)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)

    const list = await ws.admin.agent.get(`${ws.base}/boards`).expect(200)
    expect((list.body as { items: Board[] }).items.map((b) => b.id)).toContain(board.id)
  })

  it('lets the creator and admins update a board, but not other members', async () => {
    const board = await createBoardAs(ws.member.agent, ws.base)
    await ws.member.agent.patch(`${ws.base}/boards/${board.id}`).send({ name: 'Mine' }).expect(200)
    await ws.admin.agent
      .patch(`${ws.base}/boards/${board.id}`)
      .send({ description: 'Q3 work' })
      .expect(200)

    const ownersBoard = await createBoardAs(ws.owner.agent, ws.base)
    const denied = await ws.member.agent
      .patch(`${ws.base}/boards/${ownersBoard.id}`)
      .send({ name: 'Nope' })
    expect(denied.status).toBe(403)

    const detail = await getBoardDetail(ws.member.agent, ws.base, board.id)
    expect(detail.board).toMatchObject({ name: 'Mine', description: 'Q3 work' })
  })

  it('archives and restores; archived boards are readable but reject changes', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const task = await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo.id,
      title: 'Keep me',
    })

    const archived = await ws.owner.agent.post(`${ws.base}/boards/${board.id}/archive`).expect(200)
    expect((archived.body as Board).archivedAt).not.toBeNull()

    const detail = await getBoardDetail(ws.member.agent, ws.base, board.id)
    expect(detail.tasks.map((t) => t.id)).toEqual([task.id])

    const blocked = await Promise.all([
      ws.member.agent.post(`/boards/${board.id}/tasks`).send({ columnId: todo.id, title: 'x' }),
      ws.member.agent.patch(`/tasks/${task.id}`).send({ title: 'x' }),
      ws.member.agent.post(`/tasks/${task.id}/move`).send({ columnId: todo.id, afterTaskId: null }),
      ws.owner.agent.post(`/boards/${board.id}/columns`).send({ name: 'Later' }),
      ws.owner.agent.patch(`${ws.base}/boards/${board.id}`).send({ name: 'x' }),
    ])
    expect(blocked.map((r) => r.status)).toEqual([403, 403, 403, 403, 403])
    expect((blocked[0].body as { error: { message: string } }).error.message).toMatch(/archived/)

    // Only managers may restore.
    await ws.member.agent.post(`${ws.base}/boards/${board.id}/restore`).expect(403)
    const restored = await ws.owner.agent.post(`${ws.base}/boards/${board.id}/restore`).expect(200)
    expect((restored.body as Board).archivedAt).toBeNull()
    await ws.member.agent.patch(`/tasks/${task.id}`).send({ title: 'Edited' }).expect(200)
  })

  it('hides boards, columns and tasks from non-members', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const task = await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo.id,
      title: 'Secret',
    })
    const outsider = ws.outsider.agent
    const responses = await Promise.all([
      outsider.get(`${ws.base}/boards`),
      outsider.get(`${ws.base}/boards/${board.id}`),
      outsider.post(`/boards/${board.id}/columns`).send({ name: 'x' }),
      outsider.post(`/boards/${board.id}/tasks`).send({ columnId: todo.id, title: 'x' }),
      outsider.get(`/tasks/${task.id}`),
      outsider.patch(`/tasks/${task.id}`).send({ title: 'x' }),
    ])
    expect(responses.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404])
  })

  it('returns the board, ordered columns and active tasks in one request', async () => {
    const { board, todo, done } = await boardWithColumns(ws.owner.agent, ws.base)
    await createTaskAs(ws.owner.agent, board.id, { columnId: done.id, title: 'Shipped' })
    await createTaskAs(ws.owner.agent, board.id, {
      columnId: todo.id,
      title: 'Plan',
      assigneeIds: [ws.member.user.id],
    })
    const detail = await getBoardDetail(ws.member.agent, ws.base, board.id)
    expect(detail.board.taskCount).toBe(2)
    expect(detail.tasks.find((t) => t.title === 'Plan')?.assignees).toEqual([
      { id: ws.member.user.id, name: ws.member.user.name, avatarUrl: null },
    ])
  })
})

describe('columns', () => {
  const names = (columns: BoardColumn[]) => columns.map((c) => c.name)

  it('creates, renames, reorders and deletes columns (creator/admin only)', async () => {
    const { board, todo, doing, done } = await boardWithColumns(ws.member.agent, ws.base)
    const created = await ws.member.agent
      .post(`/boards/${board.id}/columns`)
      .send({ name: 'Review' })
    expect(created.status).toBe(201)
    expect(names((created.body as { items: BoardColumn[] }).items)).toEqual([
      'To Do',
      'In Progress',
      'Done',
      'Review',
    ])

    await ws.member.agent
      .patch(`/boards/${board.id}/columns/${doing.id}`)
      .send({ name: 'Doing' })
      .expect(200)

    // Move "Done" first, then "To Do" after "Doing".
    await ws.member.agent
      .post(`/boards/${board.id}/columns/reorder`)
      .send({ columnId: done.id, afterColumnId: null })
      .expect(200)
    const reordered = await ws.member.agent
      .post(`/boards/${board.id}/columns/reorder`)
      .send({ columnId: todo.id, afterColumnId: doing.id })
      .expect(200)
    expect(names((reordered.body as { items: BoardColumn[] }).items)).toEqual([
      'Done',
      'Doing',
      'To Do',
      'Review',
    ])

    // Admins manage any board; members only the boards they created.
    await ws.admin.agent
      .patch(`/boards/${board.id}/columns/${todo.id}`)
      .send({ name: 'ok' })
      .expect(200)
    const ownersBoard = await boardWithColumns(ws.owner.agent, ws.base, 'Owner board')
    const denied = await Promise.all([
      ws.member.agent.post(`/boards/${ownersBoard.board.id}/columns`).send({ name: 'x' }),
      ws.member.agent
        .patch(`/boards/${ownersBoard.board.id}/columns/${ownersBoard.todo.id}`)
        .send({ name: 'x' }),
      ws.member.agent.delete(`/boards/${ownersBoard.board.id}/columns/${ownersBoard.done.id}`),
    ])
    expect(denied.map((r) => r.status)).toEqual([403, 403, 403])

    const review = (reordered.body as { items: BoardColumn[] }).items.find(
      (c) => c.name === 'Review',
    )
    const deleted = await ws.member.agent.delete(`/boards/${board.id}/columns/${review?.id ?? ''}`)
    expect(deleted.status).toBe(200)
    expect(names((deleted.body as { items: BoardColumn[] }).items)).not.toContain('Review')
  })

  it('refuses to delete a column with active tasks, and the last column', async () => {
    const { board, todo, doing, done } = await boardWithColumns(ws.owner.agent, ws.base)
    await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'Blocker' })
    const refused = await ws.owner.agent.delete(`/boards/${board.id}/columns/${todo.id}`)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ error: { code: 'COLUMN_NOT_EMPTY' } })
    expect((refused.body as { error: { message: string } }).error.message).toMatch(/Move it/)

    // Archived tasks do not block: they move to the first remaining column.
    const archivedTask = await createTaskAs(ws.owner.agent, board.id, {
      columnId: doing.id,
      title: 'Old',
    })
    await ws.owner.agent.post(`/tasks/${archivedTask.id}/archive`).expect(200)
    await ws.owner.agent.delete(`/boards/${board.id}/columns/${doing.id}`).expect(200)
    const moved = await getPrisma().task.findUniqueOrThrow({ where: { id: archivedTask.id } })
    expect(moved.columnId).toBe(todo.id)

    await ws.owner.agent.delete(`/boards/${board.id}/columns/${done.id}`).expect(200)
    // Make "To Do" deletable, then try to remove the last column.
    const remaining = await getBoardDetail(ws.owner.agent, ws.base, board.id)
    for (const task of remaining.tasks) {
      await ws.owner.agent.post(`/tasks/${task.id}/archive`).expect(200)
    }
    const last = await ws.owner.agent.delete(`/boards/${board.id}/columns/${todo.id}`)
    expect(last.status).toBe(409)
    expect(last.body).toMatchObject({ error: { code: 'CONFLICT' } })
  })

  it('keeps columns inside their board', async () => {
    const first = await boardWithColumns(ws.owner.agent, ws.base, 'First')
    const second = await boardWithColumns(ws.owner.agent, ws.base, 'Second')
    const responses = await Promise.all([
      ws.owner.agent
        .patch(`/boards/${first.board.id}/columns/${second.todo.id}`)
        .send({ name: 'x' }),
      ws.owner.agent.delete(`/boards/${first.board.id}/columns/${second.todo.id}`),
      ws.owner.agent
        .post(`/boards/${first.board.id}/columns/reorder`)
        .send({ columnId: first.todo.id, afterColumnId: second.todo.id }),
      ws.owner.agent
        .post(`/boards/${first.board.id}/tasks`)
        .send({ columnId: second.todo.id, title: 'Wrong board' }),
    ])
    expect(responses.map((r) => r.status)).toEqual([404, 404, 400, 400])
  })

  it('rebalances column positions when the gap is exhausted', async () => {
    const { board, todo, doing, done } = await boardWithColumns(ws.owner.agent, ws.base)
    const prisma = getPrisma()
    // Neighbours closer than doubles can split.
    await prisma.boardColumn.update({ where: { id: todo.id }, data: { position: 1 } })
    await prisma.boardColumn.update({ where: { id: doing.id }, data: { position: 1.0000000001 } })

    const response = await ws.owner.agent
      .post(`/boards/${board.id}/columns/reorder`)
      .send({ columnId: done.id, afterColumnId: todo.id })
      .expect(200)
    const columns = (response.body as { items: BoardColumn[] }).items
    expect(names(columns)).toEqual(['To Do', 'Done', 'In Progress'])
    expect(columns.map((c) => c.position)).toEqual([1024, 2048, 3072])
  })
})
