import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { useUiStore } from '@/stores/ui-store'

import { AppSidebar } from './AppSidebar'

export const MOBILE_NAV_ID = 'mobile-navigation'

/** Off-canvas navigation drawer for small screens (hidden from `md` up). */
export function MobileNav() {
  const open = useUiStore((state) => state.mobileNavOpen)
  const setOpen = useUiStore((state) => state.setMobileNavOpen)
  const { pathname } = useLocation()

  // Close after navigating (covers link clicks and browser back/forward).
  useEffect(() => {
    setOpen(false)
  }, [pathname, setOpen])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        aria-hidden
        className="absolute inset-0 animate-in bg-black/50 fade-in-0"
        onClick={() => {
          setOpen(false)
        }}
      />
      <div
        id={MOBILE_NAV_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 w-(--sidebar-width) max-w-[85vw] animate-in border-r border-sidebar-border shadow-lg slide-in-from-left"
      >
        <AppSidebar />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2.5 right-2"
          aria-label="Close navigation"
          onClick={() => {
            setOpen(false)
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  )
}
