import type { z } from 'zod'

import type {
  boardDetailSchema,
  boardListResponseSchema,
  boardSchema,
  columnSchema,
  createBoardInputSchema,
  createTaskInputSchema,
  createTaskLabelInputSchema,
  moveTaskInputSchema,
  moveTaskResponseSchema,
  taskLabelSchema,
  taskPlacementSchema,
  taskSchema,
  taskSearchResultSchema,
  updateBoardInputSchema,
  updateTaskInputSchema,
  updateTaskLabelInputSchema,
} from '../schemas/tasks'

export type Board = z.infer<typeof boardSchema>
export type BoardListResponse = z.infer<typeof boardListResponseSchema>
export type BoardColumn = z.infer<typeof columnSchema>
export type BoardDetail = z.infer<typeof boardDetailSchema>
export type TaskLabel = z.infer<typeof taskLabelSchema>
export type Task = z.infer<typeof taskSchema>
export type TaskPlacement = z.infer<typeof taskPlacementSchema>
export type MoveTaskResponse = z.infer<typeof moveTaskResponseSchema>
export type TaskSearchResult = z.infer<typeof taskSearchResultSchema>

export type CreateBoardInput = z.input<typeof createBoardInputSchema>
export type UpdateBoardInput = z.input<typeof updateBoardInputSchema>
export type CreateTaskInput = z.input<typeof createTaskInputSchema>
export type UpdateTaskInput = z.input<typeof updateTaskInputSchema>
export type MoveTaskInput = z.input<typeof moveTaskInputSchema>
export type CreateTaskLabelInput = z.input<typeof createTaskLabelInputSchema>
export type UpdateTaskLabelInput = z.input<typeof updateTaskLabelInputSchema>

export interface ColumnListResponse {
  items: BoardColumn[]
}
export interface TaskLabelListResponse {
  items: TaskLabel[]
}
export interface TaskListResponse {
  items: Task[]
}
export interface TaskSearchResponse {
  items: TaskSearchResult[]
}
