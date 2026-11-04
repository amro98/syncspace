import {
  boardDetailSchema,
  boardListResponseSchema,
  boardSchema,
  columnListResponseSchema,
  type CreateBoardInput,
  type CreateTaskInput,
  type CreateTaskLabelInput,
  moveTaskResponseSchema,
  taskLabelListResponseSchema,
  taskLabelSchema,
  taskListResponseSchema,
  taskSchema,
  taskSearchResponseSchema,
  type UpdateBoardInput,
  type UpdateTaskInput,
  type UpdateTaskLabelInput,
} from '@syncspace/shared'

import { apiClient } from '@/lib/api-client'

const ws = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`

// Boards ---------------------------------------------------------------------------

export async function fetchBoards(workspaceId: string, signal?: AbortSignal) {
  const { items } = await apiClient.get(`${ws(workspaceId)}/boards`, {
    schema: boardListResponseSchema,
    ...(signal && { signal }),
  })
  return items
}

export function fetchBoard(workspaceId: string, boardId: string, signal?: AbortSignal) {
  return apiClient.get(`${ws(workspaceId)}/boards/${boardId}`, {
    schema: boardDetailSchema,
    ...(signal && { signal }),
  })
}

export function createBoard(workspaceId: string, input: CreateBoardInput) {
  return apiClient.post(`${ws(workspaceId)}/boards`, { body: input, schema: boardSchema })
}

export function updateBoard(workspaceId: string, boardId: string, input: UpdateBoardInput) {
  return apiClient.patch(`${ws(workspaceId)}/boards/${boardId}`, {
    body: input,
    schema: boardSchema,
  })
}

export function setBoardArchived(workspaceId: string, boardId: string, archived: boolean) {
  return apiClient.post(
    `${ws(workspaceId)}/boards/${boardId}/${archived ? 'archive' : 'restore'}`,
    {
      schema: boardSchema,
    },
  )
}

export async function fetchArchivedTasks(
  workspaceId: string,
  boardId: string,
  signal?: AbortSignal,
) {
  const { items } = await apiClient.get(`${ws(workspaceId)}/boards/${boardId}/archived-tasks`, {
    schema: taskListResponseSchema,
    ...(signal && { signal }),
  })
  return items
}

// Columns --------------------------------------------------------------------------

export async function createColumn(boardId: string, name: string) {
  const { items } = await apiClient.post(`/boards/${boardId}/columns`, {
    body: { name },
    schema: columnListResponseSchema,
  })
  return items
}

export async function renameColumn(boardId: string, columnId: string, name: string) {
  const { items } = await apiClient.patch(`/boards/${boardId}/columns/${columnId}`, {
    body: { name },
    schema: columnListResponseSchema,
  })
  return items
}

export async function moveColumn(boardId: string, columnId: string, afterColumnId: string | null) {
  const { items } = await apiClient.post(`/boards/${boardId}/columns/reorder`, {
    body: { columnId, afterColumnId },
    schema: columnListResponseSchema,
  })
  return items
}

export async function deleteColumn(boardId: string, columnId: string) {
  const { items } = await apiClient.delete(`/boards/${boardId}/columns/${columnId}`, {
    schema: columnListResponseSchema,
  })
  return items
}

// Tasks ----------------------------------------------------------------------------

export function createTask(boardId: string, input: CreateTaskInput) {
  return apiClient.post(`/boards/${boardId}/tasks`, { body: input, schema: taskSchema })
}

export function fetchTask(taskId: string, signal?: AbortSignal) {
  return apiClient.get(`/tasks/${taskId}`, { schema: taskSchema, ...(signal && { signal }) })
}

export function updateTask(taskId: string, input: UpdateTaskInput) {
  return apiClient.patch(`/tasks/${taskId}`, { body: input, schema: taskSchema })
}

export function moveTask(taskId: string, columnId: string, afterTaskId: string | null) {
  return apiClient.post(`/tasks/${taskId}/move`, {
    body: { columnId, afterTaskId },
    schema: moveTaskResponseSchema,
  })
}

export function setTaskAssignees(taskId: string, userIds: string[]) {
  return apiClient.put(`/tasks/${taskId}/assignees`, { body: { userIds }, schema: taskSchema })
}

export function setTaskLabels(taskId: string, labelIds: string[]) {
  return apiClient.put(`/tasks/${taskId}/labels`, { body: { labelIds }, schema: taskSchema })
}

export function setTaskArchived(taskId: string, archived: boolean) {
  return apiClient.post(`/tasks/${taskId}/${archived ? 'archive' : 'restore'}`, {
    schema: taskSchema,
  })
}

export async function searchTasks(workspaceId: string, q: string, signal?: AbortSignal) {
  const { items } = await apiClient.get(`${ws(workspaceId)}/tasks/search`, {
    query: { q },
    schema: taskSearchResponseSchema,
    ...(signal && { signal }),
  })
  return items
}

// Labels ---------------------------------------------------------------------------

export async function fetchLabels(workspaceId: string, signal?: AbortSignal) {
  const { items } = await apiClient.get(`${ws(workspaceId)}/task-labels`, {
    schema: taskLabelListResponseSchema,
    ...(signal && { signal }),
  })
  return items
}

export function createLabel(workspaceId: string, input: CreateTaskLabelInput) {
  return apiClient.post(`${ws(workspaceId)}/task-labels`, { body: input, schema: taskLabelSchema })
}

export function updateLabel(labelId: string, input: UpdateTaskLabelInput) {
  return apiClient.patch(`/task-labels/${labelId}`, { body: input, schema: taskLabelSchema })
}

export function deleteLabel(labelId: string) {
  return apiClient.delete<undefined>(`/task-labels/${labelId}`)
}
