import type { Board, BoardColumn, Task, TaskLabel } from '@syncspace/shared'

import type { Prisma } from '@/generated/prisma/client'
import { attachmentSelect, toAttachmentDto } from '@/modules/attachments/attachments.service'
import { publicUserSelect, toPublicUser } from '@/modules/chat/presenters'

/**
 * The single place where board/task rows become API and socket DTOs. Only
 * public user fields (id, name, avatar) leave the server.
 */

// Boards -------------------------------------------------------------------------

export const boardSelect = {
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  createdById: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: publicUserSelect },
  _count: { select: { columns: true, tasks: { where: { archivedAt: null } } } },
} satisfies Prisma.BoardSelect

export type BoardRow = Prisma.BoardGetPayload<{ select: typeof boardSelect }>

export function toBoardDto(board: BoardRow): Board {
  return {
    id: board.id,
    workspaceId: board.workspaceId,
    name: board.name,
    description: board.description,
    createdBy: board.createdBy ? toPublicUser(board.createdBy) : null,
    archivedAt: board.archivedAt?.toISOString() ?? null,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
    columnCount: board._count.columns,
    taskCount: board._count.tasks,
  }
}

// Columns ------------------------------------------------------------------------

export const columnSelect = {
  id: true,
  boardId: true,
  name: true,
  position: true,
} satisfies Prisma.BoardColumnSelect

export type ColumnRow = Prisma.BoardColumnGetPayload<{ select: typeof columnSelect }>

export function toColumnDto(column: ColumnRow): BoardColumn {
  return { id: column.id, boardId: column.boardId, name: column.name, position: column.position }
}

/** Column ordering: position, ties broken by id. */
export const columnOrder = [
  { position: 'asc' },
  { id: 'asc' },
] satisfies Prisma.BoardColumnOrderByWithRelationInput[]

// Labels -------------------------------------------------------------------------

export const labelSelect = {
  id: true,
  workspaceId: true,
  name: true,
  color: true,
} satisfies Prisma.TaskLabelSelect

export type LabelRow = Prisma.TaskLabelGetPayload<{ select: typeof labelSelect }>

export function toLabelDto(label: LabelRow): TaskLabel {
  return { id: label.id, workspaceId: label.workspaceId, name: label.name, color: label.color }
}

// Tasks --------------------------------------------------------------------------

export const taskSelect = {
  id: true,
  workspaceId: true,
  boardId: true,
  columnId: true,
  title: true,
  description: true,
  priority: true,
  position: true,
  dueDate: true,
  completedAt: true,
  archivedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: publicUserSelect },
  assignees: { select: { user: { select: publicUserSelect } }, orderBy: { assignedAt: 'asc' } },
  labels: { select: { label: { select: labelSelect } } },
  attachments: { select: attachmentSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.TaskSelect

export type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>

/** Task ordering inside a column: position, ties broken by id. */
export const taskOrder = [
  { position: 'asc' },
  { id: 'asc' },
] satisfies Prisma.TaskOrderByWithRelationInput[]

export function toTaskDto(task: TaskRow): Task {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    boardId: task.boardId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    position: task.position,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    createdBy: task.createdBy ? toPublicUser(task.createdBy) : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    assignees: task.assignees.map((assignee) => toPublicUser(assignee.user)),
    labels: task.labels
      .map((assignment) => toLabelDto(assignment.label))
      .sort((a, b) => a.name.localeCompare(b.name)),
    attachments: task.attachments.map(toAttachmentDto),
  }
}
