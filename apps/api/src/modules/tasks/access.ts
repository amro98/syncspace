import { type BoardContext, rooms, type TaskContext } from '@syncspace/shared'

import { forbidden } from '@/lib/errors'
import {
  authorize,
  canEditTask,
  canManageBoard,
  canViewBoard,
  canViewWorkspace,
  ensureVisible,
  toActor,
  toBoardContext,
  toTaskContext,
} from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'

/**
 * Board and task access. Every loader verifies the viewer belongs to the
 * entity's workspace (404 otherwise, so ids from other workspaces look like
 * they do not exist) and returns the normalised policy context.
 */

const boardAccessSelect = {
  id: true,
  workspaceId: true,
  name: true,
  createdById: true,
  archivedAt: true,
} as const

export interface BoardAccess {
  workspace: WorkspaceAccess
  board: {
    id: string
    workspaceId: string
    name: string
    createdById: string | null
    archivedAt: Date | null
  }
  context: BoardContext
}

export interface TaskAccess extends BoardAccess {
  task: {
    id: string
    boardId: string
    columnId: string
    title: string
    createdById: string | null
    completedAt: Date | null
    archivedAt: Date | null
  }
  taskContext: TaskContext
}

/** Membership lookup for routes addressed by entity id (/boards/:id, /tasks/:id, ...). */
export async function workspaceAccessFor(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAccess> {
  const membership = await getPrisma().workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, joinedAt: true },
  })
  ensureVisible(canViewWorkspace(toActor(userId, membership)), 'Not found')
  if (!membership) throw new Error('unreachable')
  return { workspaceId, actor: { userId, role: membership.role }, membership }
}

function toBoardAccess(workspace: WorkspaceAccess, board: BoardAccess['board']): BoardAccess {
  ensureVisible(canViewBoard(workspace.actor), 'Board not found')
  return { workspace, board, context: toBoardContext(board) }
}

/** Board inside an already-verified workspace (workspace-scoped routes). */
export async function loadBoard(workspace: WorkspaceAccess, boardId: string): Promise<BoardAccess> {
  const board = await getPrisma().board.findFirst({
    where: { id: boardId, workspaceId: workspace.workspaceId },
    select: boardAccessSelect,
  })
  ensureVisible(board !== null, 'Board not found')
  if (!board) throw new Error('unreachable')
  return toBoardAccess(workspace, board)
}

/** Board by id alone (/boards/:boardId routes). */
export async function loadBoardById(userId: string, boardId: string): Promise<BoardAccess> {
  const board = await getPrisma().board.findUnique({
    where: { id: boardId },
    select: boardAccessSelect,
  })
  ensureVisible(board !== null, 'Board not found')
  if (!board) throw new Error('unreachable')
  return toBoardAccess(await workspaceAccessFor(userId, board.workspaceId), board)
}

/** Task by id (/tasks/:taskId routes), with its board. */
export async function loadTaskById(userId: string, taskId: string): Promise<TaskAccess> {
  const task = await getPrisma().task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      workspaceId: true,
      boardId: true,
      columnId: true,
      title: true,
      createdById: true,
      completedAt: true,
      archivedAt: true,
      board: { select: boardAccessSelect },
    },
  })
  ensureVisible(task !== null, 'Task not found')
  if (!task) throw new Error('unreachable')
  const workspace = await workspaceAccessFor(userId, task.workspaceId)
  const { board, ...row } = task
  return {
    ...toBoardAccess(workspace, board),
    task: row,
    taskContext: toTaskContext(row, board),
  }
}

/** Structure changes (board settings, columns): creator or OWNER/ADMIN, board not archived. */
export function authorizeBoardStructure(access: BoardAccess): void {
  authorize(canManageBoard(access.workspace.actor, access.context))
  if (access.context.isArchived)
    throw forbidden('This board is archived. Restore it to make changes.')
}

/** Task changes: any member, while the board is active. */
export function authorizeTaskEdit(access: TaskAccess): void {
  authorize(
    canEditTask(access.workspace.actor, access.taskContext),
    access.context.isArchived ? 'This board is archived. Restore it to make changes.' : undefined,
  )
}

/** Boards are workspace-wide: every board/task event goes to the workspace room. */
export function boardRoom(workspaceId: string) {
  return rooms.workspace(workspaceId)
}
