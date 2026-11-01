import { House, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'

import { paths } from '@/app/router/paths'
import { ChatSidebar } from '@/features/chat/components/ChatSidebar'
import { WorkspaceSwitcher } from '@/features/workspaces/components/WorkspaceSwitcher'
import { useCurrentWorkspaceId, useWorkspaceActor } from '@/features/workspaces/hooks'
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
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-4',
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
 * Workspace navigation: switcher, workspace pages, channels and direct
 * messages. Rendered inline on desktop and inside the mobile drawer.
 */
export function AppSidebar() {
  const workspaceId = useCurrentWorkspaceId()
  const actor = useWorkspaceActor()

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-(--topbar-height) shrink-0 items-center border-b border-sidebar-border px-2">
        <WorkspaceSwitcher workspaceId={workspaceId} />
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col overflow-y-auto p-2">
        <div className="flex flex-col gap-0.5">
          <SidebarLink to={paths.overview(workspaceId)} icon={<House aria-hidden />}>
            Overview
          </SidebarLink>
          <SidebarLink to={paths.settings(workspaceId)} icon={<Settings aria-hidden />}>
            Settings
          </SidebarLink>
        </div>
        {actor && <ChatSidebar workspaceId={workspaceId} actor={actor} />}
      </nav>
    </div>
  )
}
