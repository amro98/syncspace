import { canEditTask, canManageBoard, type BoardContext } from '@syncspace/shared'
import { Archive, ArchiveRestore, KanbanSquare, Settings } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'

import { paths } from '@/app/router/paths'
import { Button } from '@/components/ui/button'
import { useSession } from '@/features/auth/hooks'
import { errorMessage } from '@/features/auth/messages'
import { RouteNotice, type NoticeState } from '@/features/chat/components/RouteNotice'
import { useWorkspaceMembers } from '@/features/chat/hooks'
import { useCurrentWorkspaceId, useWorkspaceActor } from '@/features/workspaces/hooks'
import { useDocumentTitle } from '@/lib/use-document-title'
import { toast } from '@/stores/toast-store'
import { useWorkspacePrefsStore } from '@/stores/workspace-prefs-store'

import { orderBoards } from '../cache'
import { ArchivedTasksDialog, BoardSettingsDialog } from '../components/BoardDialogs'
import { BoardCanvas } from '../components/BoardCanvas'
import { BoardSkeleton } from '../components/BoardSkeleton'
import { FilterBar } from '../components/FilterBar'
import { TaskPanel } from '../components/TaskPanel'
import { matchesFilters, parseFilters, writeFilters } from '../filters'
import { useBoard, useBoards, useTask, useTaskLabels } from '../hooks'

/** `/app/workspaces/:workspaceId/tasks/:boardId` (`?task=<id>` opens a task). */
export function BoardPage() {
  const workspaceId = useCurrentWorkspaceId()
  const { boardId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const board = useBoard(workspaceId, boardId)
  const boards = useBoards(workspaceId)
  const labels = useTaskLabels(workspaceId)
  const members = useWorkspaceMembers(workspaceId)
  const actor = useWorkspaceActor()
  const { data: user } = useSession()
  const setLastBoardId = useWorkspacePrefsStore((state) => state.setLastBoardId)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const loaded = board.isSuccess
  useDocumentTitle(board.data?.board.name ?? 'Board')
  useEffect(() => {
    if (loaded) setLastBoardId(workspaceId, boardId)
  }, [loaded, workspaceId, boardId, setLastBoardId])

  const filters = useMemo(() => parseFilters(searchParams), [searchParams])
  const taskId = searchParams.get('task')
  const detail = board.data
  const visibleTasks = useMemo(() => {
    if (!detail) return []
    // One clock reading per filter pass (due-date filters), not one per task.
    const now = new Date()
    return detail.tasks.filter((task) => matchesFilters(task, filters, user?.id ?? '', now))
  }, [detail, filters, user?.id])
  const boardTask = taskId ? detail?.tasks.find((task) => task.id === taskId) : undefined
  const fetchedTask = useTask(workspaceId, taskId ?? '', Boolean(taskId) && !boardTask && loaded)
  const panelTask = boardTask ?? fetchedTask.data

  const openTask = useCallback(
    (id: string) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('task', id)
        return next
      })
    },
    [setSearchParams],
  )
  const closeTask = useCallback(() => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('task')
      return next
    })
  }, [setSearchParams])
  // Rolled-back drags are reported as toasts: the card is already back where it was.
  const reportError = useCallback((message: string) => {
    toast.error(message)
  }, [])

  if (board.isPending || !actor) return <BoardSkeleton />
  if (board.isError) {
    if (board.error.code === 'NOT_FOUND' || board.error.code === 'VALIDATION_ERROR') {
      const state: NoticeState = { notice: 'That board is not available.' }
      return <Navigate to={paths.tasks(workspaceId)} replace state={state} />
    }
    return (
      <p className="p-6 text-sm text-danger" role="alert">
        {errorMessage(board.error)}
      </p>
    )
  }

  const data = board.data
  // A task link pointing at another board: follow it there.
  if (fetchedTask.data && fetchedTask.data.boardId !== boardId) {
    return (
      <Navigate
        to={paths.board(workspaceId, fetchedTask.data.boardId, { task: fetchedTask.data.id })}
        replace
      />
    )
  }

  const context: BoardContext = {
    createdById: data.board.createdBy?.id ?? null,
    isArchived: data.board.archivedAt !== null,
  }
  const canManage = canManageBoard(actor, context) && !context.isArchived
  const canEdit = canEditTask(actor, { createdById: null, board: context })
  const otherBoards = orderBoards(boards.data ?? [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-(--topbar-height) shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        <KanbanSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h1 className="min-w-0 truncate font-semibold">{data.board.name}</h1>
        {context.isArchived && (
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            <Archive className="size-3" aria-hidden />
            Archived
          </span>
        )}
        {otherBoards.length > 1 && (
          <>
            <label htmlFor="board-switcher" className="sr-only">
              Switch board
            </label>
            <select
              id="board-switcher"
              value={boardId}
              onChange={(event) => {
                void navigate(paths.board(workspaceId, event.target.value))
              }}
              className="h-8 max-w-40 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {otherBoards.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.archivedAt ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setArchiveOpen(true)
            }}
          >
            <ArchiveRestore aria-hidden />
            <span className="max-sm:sr-only">Archived tasks</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Board settings"
            onClick={() => {
              setSettingsOpen(true)
            }}
          >
            <Settings aria-hidden />
          </Button>
        </div>
      </header>

      <RouteNotice />
      {context.isArchived && (
        <p role="status" className="border-b bg-warning/10 px-4 py-2 text-sm">
          This board is archived and read-only.
          {canManageBoard(actor, context) && ' Restore it from Board settings to make changes.'}
        </p>
      )}

      <div className="pt-2">
        <FilterBar
          filters={filters}
          onChange={(next) => {
            setSearchParams(writeFilters(searchParams, next), { replace: true })
          }}
          members={members.data ?? []}
          labels={labels.data ?? []}
          shown={visibleTasks.length}
          total={data.tasks.length}
        />
      </div>

      <div className="min-h-0 flex-1">
        <BoardCanvas
          workspaceId={workspaceId}
          detail={data}
          visibleTasks={visibleTasks}
          canManage={canManage}
          canEdit={canEdit}
          onOpenTask={openTask}
          onError={reportError}
        />
      </div>

      {taskId && (
        <TaskPanel
          key={taskId}
          workspaceId={workspaceId}
          task={panelTask}
          loading={!boardTask && fetchedTask.isPending}
          error={fetchedTask.error}
          columns={data.columns}
          columnTasks={data.tasks}
          labels={labels.data ?? []}
          members={members.data ?? []}
          canEdit={canEdit}
          readOnlyReason={
            context.isArchived ? 'This board is archived, so its tasks are read-only.' : null
          }
          onClose={closeTask}
        />
      )}
      <BoardSettingsDialog
        key={`${data.board.id}:${data.board.updatedAt}`}
        workspaceId={workspaceId}
        board={data.board}
        actor={actor}
        canManage={canManageBoard(actor, context)}
        labels={labels.data ?? []}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <ArchivedTasksDialog
        workspaceId={workspaceId}
        boardId={boardId}
        canEdit={canEdit}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onOpenTask={openTask}
      />
    </div>
  )
}
