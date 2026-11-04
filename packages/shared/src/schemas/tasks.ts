import { z } from 'zod'

import { LIMITS } from '../constants/domain'
import { attachmentSchema, publicUserSchema } from './chat'
import { idSchema, isoDateTimeSchema } from './common'
import { hexColorSchema, taskPrioritySchema } from './domain'

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export const boardNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a board name')
  .max(LIMITS.BOARD_NAME_MAX, `Use at most ${String(LIMITS.BOARD_NAME_MAX)} characters`)

export const boardDescriptionSchema = z
  .string()
  .trim()
  .max(
    LIMITS.BOARD_DESCRIPTION_MAX,
    `Use at most ${String(LIMITS.BOARD_DESCRIPTION_MAX)} characters`,
  )

export const createBoardInputSchema = z.object({
  name: boardNameSchema,
  description: boardDescriptionSchema.optional(),
})

export const updateBoardInputSchema = z
  .object({
    name: boardNameSchema.optional(),
    /** Empty string or null clears the description. */
    description: boardDescriptionSchema.nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: 'Nothing to update',
  })

export const boardSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  createdBy: publicUserSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  columnCount: z.number().int().min(0),
  /** Active (non-archived) tasks. */
  taskCount: z.number().int().min(0),
})

export const boardListResponseSchema = z.object({ items: z.array(boardSchema) })

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** Default columns of a new board, in order. */
export const DEFAULT_BOARD_COLUMNS = ['To Do', 'In Progress', 'Done'] as const

export const columnNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a column name')
  .max(LIMITS.COLUMN_NAME_MAX, `Use at most ${String(LIMITS.COLUMN_NAME_MAX)} characters`)

export const columnSchema = z.object({
  id: idSchema,
  boardId: idSchema,
  name: z.string(),
  /** Fractional order (see positionBetween); clients sort by it. */
  position: z.number(),
})

export const createColumnInputSchema = z.object({ name: columnNameSchema })

export const updateColumnInputSchema = z.object({ name: columnNameSchema })

/** Move one column to just after `afterColumnId` (null = first). */
export const moveColumnInputSchema = z.object({
  columnId: idSchema,
  afterColumnId: idSchema.nullable(),
})

export const columnListResponseSchema = z.object({ items: z.array(columnSchema) })

// ---------------------------------------------------------------------------
// Labels (workspace-wide)
// ---------------------------------------------------------------------------

export const labelNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a label name')
  .max(LIMITS.LABEL_NAME_MAX, `Use at most ${String(LIMITS.LABEL_NAME_MAX)} characters`)

export const taskLabelSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string(),
  color: z.string(),
})

export const createTaskLabelInputSchema = z.object({
  name: labelNameSchema,
  color: hexColorSchema,
})

export const updateTaskLabelInputSchema = z
  .object({ name: labelNameSchema.optional(), color: hexColorSchema.optional() })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: 'Nothing to update',
  })

export const taskLabelListResponseSchema = z.object({ items: z.array(taskLabelSchema) })

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const taskTitleSchema = z
  .string()
  .trim()
  .min(1, 'Enter a title')
  .max(LIMITS.TASK_TITLE_MAX, `Use at most ${String(LIMITS.TASK_TITLE_MAX)} characters`)

export const taskDescriptionSchema = z
  .string()
  .max(LIMITS.TASK_DESCRIPTION_MAX, `Use at most ${String(LIMITS.TASK_DESCRIPTION_MAX)} characters`)

const userIdsSchema = z
  .array(idSchema)
  .max(LIMITS.TASK_ASSIGNEES_MAX, `At most ${String(LIMITS.TASK_ASSIGNEES_MAX)} assignees`)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate assignees')

const labelIdsSchema = z
  .array(idSchema)
  .max(LIMITS.TASK_LABELS_MAX, `At most ${String(LIMITS.TASK_LABELS_MAX)} labels`)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate labels')

export const taskSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  boardId: idSchema,
  columnId: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  priority: taskPrioritySchema,
  position: z.number(),
  /** An instant (UTC). Clients render it in the viewer's timezone. */
  dueDate: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  createdBy: publicUserSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  assignees: z.array(publicUserSchema),
  labels: z.array(taskLabelSchema),
  attachments: z.array(attachmentSchema),
})

/** Everything needed to render a board in one request. Tasks are the active ones. */
export const boardDetailSchema = z.object({
  board: boardSchema,
  columns: z.array(columnSchema),
  tasks: z.array(taskSchema),
})

export const createTaskInputSchema = z.object({
  columnId: idSchema,
  title: taskTitleSchema,
  description: taskDescriptionSchema.optional(),
  priority: taskPrioritySchema.default('MEDIUM'),
  dueDate: isoDateTimeSchema.nullable().optional(),
  assigneeIds: userIdsSchema.optional(),
  labelIds: labelIdsSchema.optional(),
})

export const updateTaskInputSchema = z
  .object({
    title: taskTitleSchema.optional(),
    description: taskDescriptionSchema.nullable().optional(),
    priority: taskPrioritySchema.optional(),
    dueDate: isoDateTimeSchema.nullable().optional(),
    /** true sets completedAt (now), false clears it. The column never changes implicitly. */
    completed: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.priority !== undefined ||
      value.dueDate !== undefined ||
      value.completed !== undefined,
    { message: 'Nothing to update' },
  )

/** Move a task to `columnId`, just after `afterTaskId` (null = top of the column). */
export const moveTaskInputSchema = z.object({
  columnId: idSchema,
  afterTaskId: idSchema.nullable(),
})

export const setTaskAssigneesInputSchema = z.object({ userIds: userIdsSchema })
export const setTaskLabelsInputSchema = z.object({ labelIds: labelIdsSchema })

/** One task's new place (a move, or every task of a rebalanced column). */
export const taskPlacementSchema = z.object({
  taskId: idSchema,
  columnId: idSchema,
  position: z.number(),
})

export const moveTaskResponseSchema = z.object({
  task: taskSchema,
  /** All placements written by the move (more than one after a rebalance). */
  placements: z.array(taskPlacementSchema),
})

export const archivedTasksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const taskListResponseSchema = z.object({ items: z.array(taskSchema) })

export const searchTasksQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const taskSearchResultSchema = z.object({
  taskId: idSchema,
  boardId: idSchema,
  boardName: z.string(),
  title: z.string(),
  priority: taskPrioritySchema,
  completedAt: isoDateTimeSchema.nullable(),
  /** Plain text around the match in the description, if the match is there. */
  snippet: z.string().nullable(),
})

export const taskSearchResponseSchema = z.object({ items: z.array(taskSearchResultSchema) })
