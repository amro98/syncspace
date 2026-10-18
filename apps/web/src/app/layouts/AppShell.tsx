import { Outlet } from 'react-router'

import { AppSidebar } from './AppSidebar'
import { MobileNav } from './MobileNav'
import { Topbar } from './Topbar'

/**
 * Authenticated application frame:
 *
 *   desktop (md+)  [ sidebar | topbar / main ]
 *   mobile         [ topbar / main ] + off-canvas sidebar drawer
 *
 * The frame is viewport-height with independently scrolling regions, which is
 * what chat and board views need.
 */
export function AppShell() {
  return (
    <div className="flex h-dvh overflow-hidden">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <aside className="hidden w-(--sidebar-width) shrink-0 border-r border-sidebar-border md:block">
        <AppSidebar />
      </aside>
      <MobileNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
