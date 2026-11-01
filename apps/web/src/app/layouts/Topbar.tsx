import { Menu, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Logo } from '@/components/shared/Logo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/features/auth/components/UserMenu'
import { SearchDialog } from '@/features/chat/components/SearchDialog'
import { ConnectionStatus } from '@/features/realtime/ConnectionStatus'
import { useCurrentWorkspaceId } from '@/features/workspaces/hooks'
import { useUiStore } from '@/stores/ui-store'

import { MOBILE_NAV_ID } from './MobileNav'

export function Topbar() {
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen)
  const toggleMobileNav = useUiStore((state) => state.toggleMobileNav)
  const workspaceId = useCurrentWorkspaceId()
  const [searching, setSearching] = useState(false)

  // Ctrl/Cmd+K opens search from anywhere in the workspace.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

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

      <div className="flex flex-1 justify-end sm:justify-center">
        <button
          type="button"
          onClick={() => {
            setSearching(true)
          }}
          aria-label="Search messages"
          className="flex h-8 items-center gap-2 rounded-md border bg-muted/50 px-2 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:w-full sm:max-w-md sm:px-3"
        >
          <Search className="size-4" aria-hidden />
          <span className="hidden flex-1 text-left sm:inline">Search messages</span>
          <kbd className="hidden rounded border bg-background px-1.5 font-sans text-[10px] sm:inline">
            Ctrl K
          </kbd>
        </button>
      </div>

      <ConnectionStatus workspaceId={workspaceId} />
      <ThemeToggle />
      <UserMenu />
      <SearchDialog workspaceId={workspaceId} open={searching} onOpenChange={setSearching} />
    </header>
  )
}
