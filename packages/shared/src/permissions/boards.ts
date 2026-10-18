import type { BoardContext, TaskContext, WorkspaceActor } from './context'
import { isWorkspaceAdmin, isWorkspaceMember } from './roles'

/**
 * Boards are workspace-wide in the MVP (no private boards): every member can
 * see every board and collaborate on tasks. Structure (board settings,
 * columns) belongs to the board's creator and OWNER/ADMIN.
 */

export function canViewBoard(actor: WorkspaceActor): boolean {
  return isWorkspaceMember(actor)
}

export function canCreateBoard(actor: WorkspaceActor): boolean {
  return isWorkspaceMember(actor)
}

/** Rename, describe, archive/unarchive, and add/rename/reorder/remove columns. */
export function canManageBoard(actor: WorkspaceActor, board: BoardContext): boolean {
  if (!isWorkspaceMember(actor)) return false
  return isWorkspaceAdmin(actor) || board.createdById === actor.userId
}

/** Permanent deletion cascades to every task, so it is OWNER/ADMIN only. Prefer archiving. */
export function canDeleteBoard(actor: WorkspaceActor): boolean {
  return isWorkspaceAdmin(actor)
}

/** Archived boards are read-only. */
export function canCreateTask(actor: WorkspaceActor, board: BoardContext): boolean {
  return isWorkspaceMember(actor) && !board.isArchived
}

/**
 * Edit any task field, move it (column/position), set priority/due date,
 * complete, archive/restore, assign members and apply labels. Collaborative:
 * any member, while the board is not archived.
 */
export function canEditTask(actor: WorkspaceActor, task: TaskContext): boolean {
  return isWorkspaceMember(actor) && !task.board.isArchived
}

/** Permanent deletion: the task's creator (on an active board) or OWNER/ADMIN. */
export function canDeleteTask(actor: WorkspaceActor, task: TaskContext): boolean {
  if (!isWorkspaceMember(actor)) return false
  if (isWorkspaceAdmin(actor)) return true
  return task.createdById === actor.userId && !task.board.isArchived
}

/** Create, rename, recolour and delete workspace labels. Applying labels is `canEditTask`. */
export function canManageLabels(actor: WorkspaceActor): boolean {
  return isWorkspaceAdmin(actor)
}
