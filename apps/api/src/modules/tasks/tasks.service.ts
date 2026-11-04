import {
  type createTaskInputSchema,
  type MoveTaskResponse,
  planInsert,
  POSITION_GAP,
  SERVER_EVENTS,
  type Task,
  type TaskSearchResult,
  type updateTaskInputSchema,
} from '@syncspace/shared'
import type { z } from 'zod'

import { badRequest, conflict } from '@/lib/errors'
import { authorize, canCreateTask } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import { makeSnippet } from '@/modules/chat/search.service'
import { notifyTaskAssigned, notifyTaskCompleted } from '@/modules/notifications/triggers'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'
import { realtime } from '@/sockets/realtime'

import { type BoardAccess, authorizeTaskEdit, boardRoom, type TaskAccess } from './access'
import { taskOrder, taskSelect, toTaskDto } from './presenters'

const ARCHIVED_BOARD = 'This board is archived. Restore it to make changes.'

async function loadTaskDto(taskId: string): Promise<Task> {
  return toTaskDto(
    await getPrisma().task.findUniqueOrThrow({ where: { id: taskId }, select: taskSelect }),
  )
}

function broadcastTask(
  task: Task,
  event: typeof SERVER_EVENTS.TASK_CREATED | typeof SERVER_EVENTS.TASK_UPDATED,
) {
  realtime.emit(boardRoom(task.workspaceId), event, { task })
  return task
}

/** Assignees must be members of the workspace (also enforced by a composite FK). */
async function assertMembers(workspaceId: string, userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return
  const count = await getPrisma().workspaceMember.count({
    where: { workspaceId, userId: { in: [...userIds] } },
  })
  if (count !== userIds.length) throw badRequest('Assignees must be members of this workspace.')
}

/** Labels must belong to the task's workspace (also enforced by a composite FK). */
async function assertLabels(workspaceId: string, labelIds: readonly string[]): Promise<void> {
  if (labelIds.length === 0) return
  const count = await getPrisma().taskLabel.count({
    where: { workspaceId, id: { in: [...labelIds] } },
  })
  if (count !== labelIds.length) throw badRequest('Labels must belong to this workspace.')
}

async function assertColumn(boardId: string, columnId: string): Promise<void> {
  const column = await getPrisma().boardColumn.findFirst({
    where: { id: columnId, boardId },
    select: { id: true },
  })
  if (!column) throw badRequest('That column does not belong to this board.')
}

function dueDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value === null ? null : new Date(value)
}

/** Plain multiline text; blank means "no description". */
function description(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  return value === null || value.trim() === '' ? null : value.trimEnd()
}

// ---------------------------------------------------------------------------
// Create / read / update
// ---------------------------------------------------------------------------

/** Creates a task at the bottom of its column, with assignees and labels, in one transaction. */
export async function createTask(
  access: BoardAccess,
  input: z.output<typeof createTaskInputSchema>,
): Promise<Task> {
  authorize(canCreateTask(access.workspace.actor, access.context), ARCHIVED_BOARD)
  const { workspaceId } = access.board
  const assigneeIds = input.assigneeIds ?? []
  const labelIds = input.labelIds ?? []
  await Promise.all([
    assertColumn(access.board.id, input.columnId),
    assertMembers(workspaceId, assigneeIds),
    assertLabels(workspaceId, labelIds),
  ])

  const taskId = await getPrisma().$transaction(async (tx) => {
    const last = await tx.task.findFirst({
      where: { columnId: input.columnId },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const task = await tx.task.create({
      data: {
        workspaceId,
        boardId: access.board.id,
        columnId: input.columnId,
        title: input.title,
        description: description(input.description) ?? null,
        priority: input.priority,
        dueDate: dueDate(input.dueDate) ?? null,
        position: (last?.position ?? 0) + POSITION_GAP,
        createdById: access.workspace.actor.userId,
      },
      select: { id: true },
    })
    if (assigneeIds.length > 0) {
      await tx.taskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ taskId: task.id, userId, workspaceId })),
      })
    }
    if (labelIds.length > 0) {
      await tx.taskLabelAssignment.createMany({
        data: labelIds.map((labelId) => ({ taskId: task.id, labelId, workspaceId })),
      })
    }
    return task.id
  })

  const task = broadcastTask(await loadTaskDto(taskId), SERVER_EVENTS.TASK_CREATED)
  await notifyTaskAssigned(access.workspace.actor.userId, task, assigneeIds)
  return task
}

export function getTask(access: TaskAccess): Promise<Task> {
  return loadTaskDto(access.task.id)
}

export async function updateTask(
  access: TaskAccess,
  input: z.output<typeof updateTaskInputSchema>,
): Promise<Task> {
  authorizeTaskEdit(access)
  const completing = input.completed === true && access.task.completedAt === null
  await getPrisma().task.update({
    where: { id: access.task.id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: description(input.description) }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.dueDate !== undefined && { dueDate: dueDate(input.dueDate) }),
      // Completion never moves the task between columns.
      ...(input.completed !== undefined && {
        completedAt: input.completed ? (access.task.completedAt ?? new Date()) : null,
      }),
    },
  })
  const task = broadcastTask(await loadTaskDto(access.task.id), SERVER_EVENTS.TASK_UPDATED)
  if (completing) {
    await notifyTaskCompleted(
      access.workspace.actor.userId,
      task,
      task.assignees.map((user) => user.id),
    )
  }
  return task
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

/**
 * Moves a task to `columnId`, just after `afterTaskId` (null = top). Normally
 * one row changes (midpoint position); when the gap is exhausted the target
 * column's active tasks are re-spaced in the same transaction. The response
 * and the `task:moved` event carry every placement written.
 */
export async function moveTask(
  access: TaskAccess,
  input: { columnId: string; afterTaskId: string | null },
): Promise<MoveTaskResponse> {
  authorizeTaskEdit(access)
  if (access.task.archivedAt) throw conflict('Restore this task before moving it.')
  if (input.afterTaskId === access.task.id)
    throw badRequest('A task cannot be placed after itself.')
  await assertColumn(access.board.id, input.columnId)

  const updates = await getPrisma().$transaction(async (tx) => {
    const siblings = await tx.task.findMany({
      where: { columnId: input.columnId, archivedAt: null, id: { not: access.task.id } },
      select: { id: true, position: true },
      orderBy: taskOrder,
    })
    if (input.afterTaskId !== null && !siblings.some((task) => task.id === input.afterTaskId)) {
      throw badRequest('afterTaskId must be an active task in the target column.')
    }
    const plan = planInsert(siblings, access.task.id, input.afterTaskId)
    for (const update of plan.updates) {
      await tx.task.update({
        where: { id: update.id },
        data: {
          position: update.position,
          ...(update.id === access.task.id && { columnId: input.columnId }),
        },
      })
    }
    return plan.updates
  })

  const placements = updates.map((update) => ({
    taskId: update.id,
    columnId: input.columnId,
    position: update.position,
  }))
  realtime.emit(boardRoom(access.board.workspaceId), SERVER_EVENTS.TASK_MOVED, {
    workspaceId: access.board.workspaceId,
    boardId: access.board.id,
    placements,
  })
  return { task: await loadTaskDto(access.task.id), placements }
}

// ---------------------------------------------------------------------------
// Assignees, labels, archive
// ---------------------------------------------------------------------------

/** Replaces the assignee set. Newly assigned people (other than the actor) are notified. */
export async function setTaskAssignees(access: TaskAccess, userIds: string[]): Promise<Task> {
  authorizeTaskEdit(access)
  const { workspaceId } = access.board
  await assertMembers(workspaceId, userIds)
  const added = await getPrisma().$transaction(async (tx) => {
    const current = await tx.taskAssignee.findMany({
      where: { taskId: access.task.id },
      select: { userId: true },
    })
    const before = new Set(current.map((row) => row.userId))
    await tx.taskAssignee.deleteMany({
      where: { taskId: access.task.id, userId: { notIn: userIds } },
    })
    const fresh = userIds.filter((id) => !before.has(id))
    if (fresh.length > 0) {
      await tx.taskAssignee.createMany({
        data: fresh.map((userId) => ({ taskId: access.task.id, userId, workspaceId })),
        skipDuplicates: true,
      })
    }
    return fresh
  })
  const task = broadcastTask(await loadTaskDto(access.task.id), SERVER_EVENTS.TASK_UPDATED)
  await notifyTaskAssigned(access.workspace.actor.userId, task, added)
  return task
}

/** Replaces the label set (labels of the same workspace only). */
export async function setTaskLabels(access: TaskAccess, labelIds: string[]): Promise<Task> {
  authorizeTaskEdit(access)
  const { workspaceId } = access.board
  await assertLabels(workspaceId, labelIds)
  await getPrisma().$transaction(async (tx) => {
    await tx.taskLabelAssignment.deleteMany({
      where: { taskId: access.task.id, labelId: { notIn: labelIds } },
    })
    if (labelIds.length > 0) {
      await tx.taskLabelAssignment.createMany({
        data: labelIds.map((labelId) => ({ taskId: access.task.id, labelId, workspaceId })),
        skipDuplicates: true,
      })
    }
  })
  return broadcastTask(await loadTaskDto(access.task.id), SERVER_EVENTS.TASK_UPDATED)
}

/**
 * Archived tasks leave the active board but keep their history (no hard
 * delete). Restoring puts the task back where it was.
 */
export async function setTaskArchived(access: TaskAccess, archived: boolean): Promise<Task> {
  authorizeTaskEdit(access)
  await getPrisma().task.update({
    where: { id: access.task.id },
    data: { archivedAt: archived ? (access.task.archivedAt ?? new Date()) : null },
  })
  return broadcastTask(await loadTaskDto(access.task.id), SERVER_EVENTS.TASK_UPDATED)
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Case-insensitive substring search over active tasks' titles and descriptions. */
export async function searchTasks(
  workspace: WorkspaceAccess,
  q: string,
  limit: number,
): Promise<TaskSearchResult[]> {
  const tasks = await getPrisma().task.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      archivedAt: null,
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      boardId: true,
      title: true,
      description: true,
      priority: true,
      completedAt: true,
      board: { select: { name: true } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit,
  })
  return tasks.map((task) => ({
    taskId: task.id,
    boardId: task.boardId,
    boardName: task.board.name,
    title: task.title,
    priority: task.priority,
    completedAt: task.completedAt?.toISOString() ?? null,
    snippet: task.description?.toLowerCase().includes(q.toLowerCase())
      ? makeSnippet(task.description, q)
      : null,
  }))
}
