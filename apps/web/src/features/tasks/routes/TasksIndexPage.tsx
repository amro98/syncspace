import { canCreateBoard } from '@syncspace/shared'
import { Archive, KanbanSquare, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'

import { paths } from '@/app/router/paths'
import { Spinner } from '@/components/shared/Spinner'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/features/auth/messages'
import { RouteNotice, type NoticeState } from '@/features/chat/components/RouteNotice'
import { useCurrentWorkspaceId, useWorkspaceActor } from '@/features/workspaces/hooks'
import { useWorkspacePrefsStore } from '@/stores/workspace-prefs-store'
import { useDocumentTitle } from '@/lib/use-document-title'

import { orderBoards } from '../cache'
import { CreateBoardDialog } from '../components/BoardDialogs'
import { useBoards } from '../hooks'

/**
 * `/app/workspaces/:workspaceId/tasks` opens the last board used here (if it is
 * still active), else the first active board, else an empty state.
 */
export function TasksIndexPage() {
  useDocumentTitle('Tasks')
  const workspaceId = useCurrentWorkspaceId()
  const boards = useBoards(workspaceId)
  const actor = useWorkspaceActor()
  const lastBoardId = useWorkspacePrefsStore((state) => state.lastBoardIds[workspaceId])
  const location = useLocation()
  const [creating, setCreating] = useState(false)

  if (boards.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner label="Loading boards" />
      </div>
    )
  }
  if (boards.isError) {
    return (
      <p className="p-6 text-sm text-danger" role="alert">
        {errorMessage(boards.error)}
      </p>
    )
  }

  const ordered = orderBoards(boards.data)
  const active = ordered.filter((board) => !board.archivedAt)
  const target = active.find((board) => board.id === lastBoardId) ?? active[0]
  if (target) {
    return (
      <Navigate
        to={paths.board(workspaceId, target.id)}
        replace
        state={location.state as NoticeState | null}
      />
    )
  }

  const archived = ordered.filter((board) => board.archivedAt)
  return (
    <div className="flex h-full flex-col">
      <RouteNotice />
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KanbanSquare className="size-6" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Create your first board</h1>
        <p className="text-sm text-muted-foreground">
          Boards organise work into columns. Add tasks, assign teammates, set priorities and due
          dates, and drag cards as work moves forward.
        </p>
        {actor && canCreateBoard(actor) && (
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <Plus aria-hidden />
            Create board
          </Button>
        )}
        {archived.length > 0 && (
          <div className="mt-4 w-full text-left">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Archived boards
            </h2>
            <ul className="flex flex-col divide-y rounded-md border">
              {archived.map((board) => (
                <li key={board.id}>
                  <Link
                    to={paths.board(workspaceId, board.id)}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Archive className="size-4 text-muted-foreground" aria-hidden />
                    {board.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <CreateBoardDialog workspaceId={workspaceId} open={creating} onOpenChange={setCreating} />
    </div>
  )
}
