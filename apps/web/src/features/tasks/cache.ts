import {
  type Board,
  type BoardColumn,
  type BoardDetail,
  byPosition,
  planInsert,
  type Task,
  type TaskLabel,
  type TaskPlacement,
} from '@syncspace/shared'

/**
 * Pure transforms of the board caches. Every realtime event and mutation
 * result goes through these, so applying the same change twice (REST response
 * + socket echo) is harmless: they set values, they never increment.
 */

export function sortedColumns(columns: readonly BoardColumn[]): BoardColumn[] {
  return [...columns].sort(byPosition)
}

/** Active tasks grouped by column, each list in board order. */
export function tasksByColumn(detail: BoardDetail): Map<string, Task[]> {
  const groups = new Map<string, Task[]>(detail.columns.map((column) => [column.id, []]))
  for (const task of detail.tasks) groups.get(task.columnId)?.push(task)
  for (const list of groups.values()) list.sort(byPosition)
  return groups
}

export function setBoard(detail: BoardDetail | undefined, board: Board): BoardDetail | undefined {
  if (detail?.board.id !== board.id) return detail
  return { ...detail, board }
}

export function setColumns(
  detail: BoardDetail | undefined,
  columns: BoardColumn[],
): BoardDetail | undefined {
  if (!detail) return detail
  const ids = new Set(columns.map((column) => column.id))
  return {
    ...detail,
    columns: sortedColumns(columns),
    // Deleting a column only ever happens when it has no active tasks.
    tasks: detail.tasks.filter((task) => ids.has(task.columnId)),
  }
}

/** Inserts or replaces an active task; archived tasks leave the active board. */
export function upsertTask(detail: BoardDetail | undefined, task: Task): BoardDetail | undefined {
  if (detail?.board.id !== task.boardId) return detail
  const others = detail.tasks.filter((existing) => existing.id !== task.id)
  return { ...detail, tasks: task.archivedAt ? others : [...others, task] }
}

/** Applies authoritative (or optimistic) placements; unknown tasks are ignored. */
export function applyPlacements(
  detail: BoardDetail | undefined,
  placements: readonly TaskPlacement[],
): BoardDetail | undefined {
  if (!detail || placements.length === 0) return detail
  const byId = new Map(placements.map((placement) => [placement.taskId, placement]))
  return {
    ...detail,
    tasks: detail.tasks.map((task) => {
      const placement = byId.get(task.id)
      return placement
        ? { ...task, columnId: placement.columnId, position: placement.position }
        : task
    }),
  }
}

/** The placements a move will produce, computed exactly like the server does. */
export function planTaskMove(
  detail: BoardDetail,
  taskId: string,
  columnId: string,
  afterTaskId: string | null,
): TaskPlacement[] {
  const siblings = detail.tasks
    .filter((task) => task.columnId === columnId && task.id !== taskId)
    .sort(byPosition)
  const known = afterTaskId === null || siblings.some((task) => task.id === afterTaskId)
  const { updates } = planInsert(
    siblings,
    taskId,
    known ? afterTaskId : (siblings.at(-1)?.id ?? null),
  )
  return updates.map((update) => ({ taskId: update.id, columnId, position: update.position }))
}

/** Optimistic column order (server answers with the authoritative list). */
export function planColumnMove(
  columns: readonly BoardColumn[],
  columnId: string,
  afterColumnId: string | null,
): BoardColumn[] {
  const siblings = sortedColumns(columns).filter((column) => column.id !== columnId)
  const { updates } = planInsert(siblings, columnId, afterColumnId)
  const positions = new Map(updates.map((update) => [update.id, update.position]))
  return sortedColumns(
    columns.map((column) => ({ ...column, position: positions.get(column.id) ?? column.position })),
  )
}

/** Keeps task label copies in sync with the workspace label list (renames, deletions). */
export function applyLabels(
  detail: BoardDetail | undefined,
  labels: readonly TaskLabel[],
): BoardDetail | undefined {
  if (!detail) return detail
  const byId = new Map(labels.map((label) => [label.id, label]))
  return {
    ...detail,
    tasks: detail.tasks.map((task) => ({
      ...task,
      labels: task.labels.flatMap((label) => {
        const current = byId.get(label.id)
        return current ? [current] : []
      }),
    })),
  }
}

export function upsertBoard(list: Board[] | undefined, board: Board): Board[] | undefined {
  if (!list) return list
  const exists = list.some((item) => item.id === board.id)
  return exists ? list.map((item) => (item.id === board.id ? board : item)) : [...list, board]
}

/** Active boards first (creation order), then archived ones. */
export function orderBoards(boards: readonly Board[]): Board[] {
  return [...boards].sort(
    (a, b) =>
      Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
      a.createdAt.localeCompare(b.createdAt),
  )
}
