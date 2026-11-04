import type {
  Board,
  BoardColumn,
  BoardDetail,
  CreateTaskInput,
  Task,
  TaskLabel,
  UpdateBoardInput,
  UpdateTaskInput,
} from '@syncspace/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { ApiError } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

import * as api from './api'
import {
  applyPlacements,
  planColumnMove,
  planTaskMove,
  setBoard,
  setColumns,
  upsertBoard,
  upsertTask,
} from './cache'

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useBoards(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.boards.list(workspaceId),
    queryFn: ({ signal }) => api.fetchBoards(workspaceId, signal),
  })
}

export function useBoard(workspaceId: string, boardId: string) {
  return useQuery({
    queryKey: queryKeys.boards.detail(workspaceId, boardId),
    queryFn: ({ signal }) => api.fetchBoard(workspaceId, boardId, signal),
    // Realtime events keep it current; refetch on reconnect / after a while.
    staleTime: 5 * 60_000,
  })
}

export function useTaskLabels(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.taskLabels.list(workspaceId),
    queryFn: ({ signal }) => api.fetchLabels(workspaceId, signal),
    staleTime: 5 * 60_000,
  })
}

/** A single task, for tasks not on the loaded board (archived, or opened from a link). */
export function useTask(workspaceId: string, taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(workspaceId, taskId),
    queryFn: ({ signal }) => api.fetchTask(taskId, signal),
    enabled,
  })
}

export function useArchivedTasks(workspaceId: string, boardId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.boards.archivedTasks(workspaceId, boardId),
    queryFn: ({ signal }) => api.fetchArchivedTasks(workspaceId, boardId, signal),
    enabled,
  })
}

export function useSearchTasks(workspaceId: string, query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: queryKeys.search(workspaceId, q, { kind: 'tasks' }),
    queryFn: ({ signal }) => api.searchTasks(workspaceId, q, signal),
    enabled: q.length >= 2,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Cache writers shared by mutations and realtime handlers
// ---------------------------------------------------------------------------

/** Writes a confirmed task everywhere it is shown: its board and its detail entry. */
export function useApplyTask(workspaceId: string) {
  const queryClient = useQueryClient()
  return useCallback(
    (task: Task) => {
      queryClient.setQueryData<BoardDetail>(
        queryKeys.boards.detail(workspaceId, task.boardId),
        (detail) => upsertTask(detail, task),
      )
      queryClient.setQueryData(queryKeys.tasks.detail(workspaceId, task.id), task)
      queryClient.setQueryData<Task[]>(
        queryKeys.boards.archivedTasks(workspaceId, task.boardId),
        (list) =>
          list
            ? task.archivedAt
              ? [task, ...list.filter((item) => item.id !== task.id)]
              : list.filter((item) => item.id !== task.id)
            : list,
      )
    },
    [queryClient, workspaceId],
  )
}

function useApplyBoard(workspaceId: string) {
  const queryClient = useQueryClient()
  return useCallback(
    (board: Board) => {
      queryClient.setQueryData<Board[]>(queryKeys.boards.list(workspaceId), (list) =>
        upsertBoard(list, board),
      )
      queryClient.setQueryData<BoardDetail>(
        queryKeys.boards.detail(workspaceId, board.id),
        (detail) => setBoard(detail, board),
      )
    },
    [queryClient, workspaceId],
  )
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export function useCreateBoard(workspaceId: string) {
  const apply = useApplyBoard(workspaceId)
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      api.createBoard(workspaceId, input),
    onSuccess: apply,
  })
}

export function useUpdateBoard(workspaceId: string, boardId: string) {
  const apply = useApplyBoard(workspaceId)
  return useMutation({
    mutationFn: (input: UpdateBoardInput) => api.updateBoard(workspaceId, boardId, input),
    onSuccess: apply,
  })
}

export function useSetBoardArchived(workspaceId: string, boardId: string) {
  const apply = useApplyBoard(workspaceId)
  return useMutation({
    mutationFn: (archived: boolean) => api.setBoardArchived(workspaceId, boardId, archived),
    onSuccess: apply,
  })
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

function useSetColumns(workspaceId: string, boardId: string) {
  const queryClient = useQueryClient()
  return useCallback(
    (columns: BoardColumn[]) => {
      queryClient.setQueryData<BoardDetail>(
        queryKeys.boards.detail(workspaceId, boardId),
        (detail) => setColumns(detail, columns),
      )
    },
    [queryClient, workspaceId, boardId],
  )
}

export function useCreateColumn(workspaceId: string, boardId: string) {
  const set = useSetColumns(workspaceId, boardId)
  return useMutation({
    mutationFn: (name: string) => api.createColumn(boardId, name),
    onSuccess: set,
  })
}

export function useRenameColumn(workspaceId: string, boardId: string) {
  const set = useSetColumns(workspaceId, boardId)
  return useMutation({
    mutationFn: ({ columnId, name }: { columnId: string; name: string }) =>
      api.renameColumn(boardId, columnId, name),
    onSuccess: set,
  })
}

export function useDeleteColumn(workspaceId: string, boardId: string) {
  const set = useSetColumns(workspaceId, boardId)
  return useMutation({
    mutationFn: (columnId: string) => api.deleteColumn(boardId, columnId),
    onSuccess: set,
  })
}

/** Optimistic column reorder: moves locally at once, rolls back on failure. */
export function useMoveColumn(workspaceId: string, boardId: string) {
  const queryClient = useQueryClient()
  const key = queryKeys.boards.detail(workspaceId, boardId)
  const set = useSetColumns(workspaceId, boardId)
  return useMutation<
    BoardColumn[],
    ApiError,
    { columnId: string; afterColumnId: string | null },
    { snapshot: BoardDetail | undefined }
  >({
    mutationFn: ({ columnId, afterColumnId }) => api.moveColumn(boardId, columnId, afterColumnId),
    onMutate: async ({ columnId, afterColumnId }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = queryClient.getQueryData<BoardDetail>(key)
      if (snapshot) {
        queryClient.setQueryData<BoardDetail>(key, {
          ...snapshot,
          columns: planColumnMove(snapshot.columns, columnId, afterColumnId),
        })
      }
      return { snapshot }
    },
    onError: (_error, _input, context) => {
      if (context?.snapshot) queryClient.setQueryData(key, context.snapshot)
    },
    onSuccess: set,
  })
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function useCreateTask(workspaceId: string, boardId: string) {
  const apply = useApplyTask(workspaceId)
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.createTask(boardId, input),
    onSuccess: apply,
  })
}

/**
 * Optimistic drag & drop:
 * 1. snapshot the board and apply the planned placements immediately;
 * 2. POST the move;
 * 3. on success write the server's placements (authoritative; equal values
 *    when nothing raced, and the socket echo re-applies the same values);
 * 4. on failure restore the snapshot and surface the error.
 */
export function useMoveTask(workspaceId: string, boardId: string) {
  const queryClient = useQueryClient()
  const key = queryKeys.boards.detail(workspaceId, boardId)
  const apply = useApplyTask(workspaceId)
  return useMutation<
    Awaited<ReturnType<typeof api.moveTask>>,
    ApiError,
    { taskId: string; columnId: string; afterTaskId: string | null },
    { snapshot: BoardDetail | undefined }
  >({
    mutationFn: ({ taskId, columnId, afterTaskId }) => api.moveTask(taskId, columnId, afterTaskId),
    onMutate: async ({ taskId, columnId, afterTaskId }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = queryClient.getQueryData<BoardDetail>(key)
      if (snapshot) {
        queryClient.setQueryData<BoardDetail>(
          key,
          applyPlacements(snapshot, planTaskMove(snapshot, taskId, columnId, afterTaskId)),
        )
      }
      return { snapshot }
    },
    onError: (_error, _input, context) => {
      if (context?.snapshot) queryClient.setQueryData(key, context.snapshot)
    },
    onSuccess: ({ task, placements }) => {
      queryClient.setQueryData<BoardDetail>(key, (detail) => applyPlacements(detail, placements))
      apply(task)
    },
  })
}

export function useUpdateTask(workspaceId: string) {
  const apply = useApplyTask(workspaceId)
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) =>
      api.updateTask(taskId, input),
    onSuccess: apply,
  })
}

export function useSetTaskAssignees(workspaceId: string) {
  const apply = useApplyTask(workspaceId)
  return useMutation({
    mutationFn: ({ taskId, userIds }: { taskId: string; userIds: string[] }) =>
      api.setTaskAssignees(taskId, userIds),
    onSuccess: apply,
  })
}

export function useSetTaskLabels(workspaceId: string) {
  const apply = useApplyTask(workspaceId)
  return useMutation({
    mutationFn: ({ taskId, labelIds }: { taskId: string; labelIds: string[] }) =>
      api.setTaskLabels(taskId, labelIds),
    onSuccess: apply,
  })
}

export function useSetTaskArchived(workspaceId: string) {
  const apply = useApplyTask(workspaceId)
  return useMutation({
    mutationFn: ({ taskId, archived }: { taskId: string; archived: boolean }) =>
      api.setTaskArchived(taskId, archived),
    onSuccess: apply,
  })
}

export function useAddTaskAttachments(workspaceId: string) {
  const apply = useApplyTask(workspaceId)
  return useMutation({
    mutationFn: ({ taskId, files }: { taskId: string; files: File[] }) =>
      api.addTaskAttachments(taskId, files),
    onSuccess: apply,
  })
}

export function useRemoveTaskAttachment(workspaceId: string) {
  const apply = useApplyTask(workspaceId)
  return useMutation({ mutationFn: api.removeTaskAttachment, onSuccess: apply })
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function useLabelMutations(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = queryKeys.taskLabels.list(workspaceId)
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })
  const create = useMutation({
    mutationFn: (input: { name: string; color: string }) => api.createLabel(workspaceId, input),
    onSuccess: (label) => {
      queryClient.setQueryData<TaskLabel[]>(key, (list) =>
        list
          ? [...list.filter((l) => l.id !== label.id), label].sort((a, b) =>
              a.name.localeCompare(b.name),
            )
          : list,
      )
    },
  })
  const update = useMutation({
    mutationFn: ({
      labelId,
      input,
    }: {
      labelId: string
      input: { name?: string; color?: string }
    }) => api.updateLabel(labelId, input),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: api.deleteLabel, onSuccess: refresh })
  return { create, update, remove }
}
