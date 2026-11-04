import {
  type Board,
  type BoardDetail,
  SERVER_EVENTS,
  type ServerToClientEvents,
  type TaskLabel,
} from '@syncspace/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { queryKeys } from '@/lib/query-keys'
import { getSocket } from '@/lib/socket'

import { applyLabels, applyPlacements, setBoard, setColumns, upsertBoard } from './cache'
import { useApplyTask } from './hooks'

type Handlers = { [E in keyof ServerToClientEvents]?: ServerToClientEvents[E] }

/**
 * Subscribes the workspace's board caches to the socket. Every event is a
 * targeted cache write; boards are never refetched after a drag. Values are
 * set (never incremented), so the echo of the viewer's own change is a no-op.
 */
export function useTasksRealtime(workspaceId: string): void {
  const queryClient = useQueryClient()
  const applyTask = useApplyTask(workspaceId)

  useEffect(() => {
    const socket = getSocket()
    const boardsKey = queryKeys.boards.list(workspaceId)
    const detailKey = (boardId: string) => queryKeys.boards.detail(workspaceId, boardId)

    const applyBoard = (board: Board) => {
      if (board.workspaceId !== workspaceId) return
      queryClient.setQueryData<Board[]>(boardsKey, (list) => upsertBoard(list, board))
      queryClient.setQueryData<BoardDetail>(detailKey(board.id), (detail) =>
        setBoard(detail, board),
      )
    }

    const handlers: Handlers = {
      [SERVER_EVENTS.BOARD_CREATED]: ({ board }) => {
        applyBoard(board)
      },
      [SERVER_EVENTS.BOARD_UPDATED]: ({ board }) => {
        applyBoard(board)
      },
      [SERVER_EVENTS.COLUMNS_UPDATED]: ({ workspaceId: from, boardId, columns }) => {
        if (from !== workspaceId) return
        queryClient.setQueryData<BoardDetail>(detailKey(boardId), (detail) =>
          setColumns(detail, columns),
        )
      },
      [SERVER_EVENTS.TASK_CREATED]: ({ task }) => {
        if (task.workspaceId === workspaceId) applyTask(task)
      },
      [SERVER_EVENTS.TASK_UPDATED]: ({ task }) => {
        if (task.workspaceId === workspaceId) applyTask(task)
      },
      [SERVER_EVENTS.TASK_MOVED]: ({ workspaceId: from, boardId, placements }) => {
        if (from !== workspaceId) return
        // Server state wins: a concurrent drag converges to these positions.
        queryClient.setQueryData<BoardDetail>(detailKey(boardId), (detail) =>
          applyPlacements(detail, placements),
        )
      },
      [SERVER_EVENTS.LABELS_UPDATED]: ({ workspaceId: from, labels }) => {
        if (from !== workspaceId) return
        queryClient.setQueryData<TaskLabel[]>(queryKeys.taskLabels.list(workspaceId), labels)
        for (const [key] of queryClient.getQueriesData<BoardDetail>({ queryKey: boardsKey })) {
          if (key.length !== detailKey('x').length) continue
          queryClient.setQueryData<BoardDetail>(key, (detail) =>
            detail && 'tasks' in detail ? applyLabels(detail, labels) : detail,
          )
        }
      },
    }

    // Missed events while offline: refresh boards (deduplicated, idempotent writes).
    let connectedBefore = socket.connected
    const onConnect = () => {
      if (connectedBefore) {
        void queryClient.invalidateQueries({ queryKey: boardsKey })
        void queryClient.invalidateQueries({ queryKey: queryKeys.taskLabels.list(workspaceId) })
      }
      connectedBefore = true
    }

    const entries = Object.entries(handlers) as [
      keyof ServerToClientEvents,
      (...args: never[]) => void,
    ][]
    for (const [event, handler] of entries) socket.on(event, handler as never)
    socket.on('connect', onConnect)
    return () => {
      for (const [event, handler] of entries) socket.off(event, handler as never)
      socket.off('connect', onConnect)
    }
  }, [queryClient, workspaceId, applyTask])
}
