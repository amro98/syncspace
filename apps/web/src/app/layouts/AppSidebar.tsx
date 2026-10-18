import { House } from 'lucide-react'
import { NavLink } from 'react-router'

import { paths } from '@/app/router/paths'
import { Logo } from '@/components/shared/Logo'
import { cn } from '@/lib/utils'

/**
 * Global navigation. Rendered inline on desktop and inside the mobile drawer.
 * Workspace switcher, channel list and DMs slot in here in later phases.
 */
export function AppSidebar() {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-(--topbar-height) shrink-0 items-center border-b border-sidebar-border px-4">
        <Logo />
      </div>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto p-2">
        <NavLink
          to={paths.app()}
          end
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )
          }
        >
          <House className="size-4" aria-hidden />
          Home
        </NavLink>
      </nav>
    </div>
  )
}
