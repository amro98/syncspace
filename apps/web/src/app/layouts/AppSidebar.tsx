import { House, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'

import { paths } from '@/app/router/paths'
import { WorkspaceSwitcher } from '@/features/workspaces/components/WorkspaceSwitcher'
import { useCurrentWorkspaceId } from '@/features/workspaces/hooks'
import { cn } from '@/lib/utils'

function SidebarLink({
  to,
  end,
  icon,
  children,
}: {
  to: string
  end?: boolean
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-4',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  )
}

/**
 * Workspace navigation. Rendered inline on desktop and inside the mobile
 * drawer. Channels, DMs and boards slot in here in their phases.
 */
export function AppSidebar() {
  const workspaceId = useCurrentWorkspaceId()

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-(--topbar-height) shrink-0 items-center border-b border-sidebar-border px-2">
        <WorkspaceSwitcher workspaceId={workspaceId} />
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        <SidebarLink to={paths.workspace(workspaceId)} end icon={<House aria-hidden />}>
          Overview
        </SidebarLink>
        <SidebarLink to={paths.settings(workspaceId)} icon={<Settings aria-hidden />}>
          Settings
        </SidebarLink>
      </nav>
    </div>
  )
}
