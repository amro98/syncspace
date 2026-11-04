import { canCreateBoard, type WorkspaceActor } from '@syncspace/shared'
import { KanbanSquare, Plus } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router'

import { paths } from '@/app/router/paths'
import { cn } from '@/lib/utils'

import { orderBoards } from '../cache'
import { useBoards } from '../hooks'
import { CreateBoardDialog } from './BoardDialogs'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
  )

/** The "Tasks" section of the workspace sidebar: active boards + create. */
export function BoardsSidebar({
  workspaceId,
  actor,
}: {
  workspaceId: string
  actor: WorkspaceActor
}) {
  const boards = useBoards(workspaceId)
  const [creating, setCreating] = useState(false)
  const active = orderBoards(boards.data ?? []).filter((board) => !board.archivedAt)

  return (
    <>
      <div className="flex items-center justify-between px-3 pt-4 pb-1">
        <h2 className="text-xs font-semibold tracking-wide text-sidebar-foreground/70 uppercase">
          Tasks
        </h2>
        {canCreateBoard(actor) && (
          <button
            type="button"
            aria-label="Create board"
            title="Create board"
            onClick={() => {
              setCreating(true)
            }}
            className="rounded p-0.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <ul aria-label="Boards" className="flex flex-col gap-0.5">
        {active.map((board) => (
          <li key={board.id}>
            <NavLink to={paths.board(workspaceId, board.id)} className={linkClass}>
              <KanbanSquare className="size-4 shrink-0 opacity-70" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{board.name}</span>
            </NavLink>
          </li>
        ))}
        {boards.isSuccess && active.length === 0 && (
          <li>
            <NavLink to={paths.tasks(workspaceId)} end className={linkClass}>
              <KanbanSquare className="size-4 shrink-0 opacity-70" aria-hidden />
              Boards
            </NavLink>
          </li>
        )}
      </ul>
      <CreateBoardDialog workspaceId={workspaceId} open={creating} onOpenChange={setCreating} />
    </>
  )
}
