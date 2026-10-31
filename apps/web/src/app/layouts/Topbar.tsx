import { Menu } from 'lucide-react'

import { Logo } from '@/components/shared/Logo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/features/auth/components/UserMenu'
import { ConnectionStatus } from '@/features/realtime/ConnectionStatus'
import { useCurrentWorkspaceId } from '@/features/workspaces/hooks'
import { useUiStore } from '@/stores/ui-store'

import { MOBILE_NAV_ID } from './MobileNav'

export function Topbar() {
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen)
  const toggleMobileNav = useUiStore((state) => state.toggleMobileNav)
  const workspaceId = useCurrentWorkspaceId()

  return (
    <header className="flex h-(--topbar-height) shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        aria-controls={MOBILE_NAV_ID}
        aria-expanded={mobileNavOpen}
        onClick={toggleMobileNav}
      >
        <Menu aria-hidden />
      </Button>
      <Logo className="md:hidden" />

      {/* Page title / breadcrumbs and global search slot in here. */}
      <div className="flex-1" />

      <ConnectionStatus workspaceId={workspaceId} />
      <ThemeToggle />
      <UserMenu />
    </header>
  )
}
