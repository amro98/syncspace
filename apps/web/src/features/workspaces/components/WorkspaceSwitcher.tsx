import type { WorkspaceRole } from '@syncspace/shared'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Link } from 'react-router'

import { paths } from '@/app/router/paths'
import { Popover } from '@/components/shared/Popover'
import { cn } from '@/lib/utils'

import { useWorkspace, useWorkspaces } from '../hooks'

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
}

function WorkspaceMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
    >
      {name.trim().charAt(0).toUpperCase() || 'W'}
    </span>
  )
}

/** Switches workspaces by navigating; the URL is the only source of the selection. */
export function WorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const { data: current } = useWorkspace(workspaceId)
  const { data: workspaces } = useWorkspaces()
  const name = current?.name ?? 'Workspace'

  return (
    <Popover
      label={`Switch workspace (current: ${name})`}
      triggerClassName="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
      className="w-64"
      trigger={
        <>
          <WorkspaceMark name={name} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{name}</span>
            {current && (
              <span className="text-xs text-muted-foreground">
                {ROLE_LABEL[current.membership.role]}
              </span>
            )}
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
        </>
      }
    >
      <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Workspaces</p>
      <nav aria-label="Your workspaces">
        <ul>
          {workspaces?.map((workspace) => {
            const active = workspace.id === workspaceId
            return (
              <li key={workspace.id}>
                <Link
                  to={paths.workspace(workspace.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                    active && 'font-medium',
                  )}
                >
                  <WorkspaceMark name={workspace.name} />
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_LABEL[workspace.role]}
                  </span>
                  {active && <Check className="size-4 text-primary" aria-hidden />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="my-1 h-px bg-border" />
      <Link
        to={paths.onboarding({ step: 'create' })}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        <Plus className="size-4" aria-hidden />
        Create workspace
      </Link>
    </Popover>
  )
}
