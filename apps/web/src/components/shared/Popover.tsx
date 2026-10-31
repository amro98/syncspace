import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router'

import { cn } from '@/lib/utils'

/**
 * Minimal disclosure popover: a trigger button and a panel that closes on
 * outside click, Escape and navigation. Enough for menus until a richer
 * primitive is needed.
 */
export function Popover({
  trigger,
  label,
  children,
  align = 'start',
  className,
  triggerClassName,
}: {
  trigger: ReactNode
  label: string
  children: ReactNode
  align?: 'start' | 'end'
  className?: string
  triggerClassName?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const { pathname } = useLocation()
  // Open "on" a route: navigating elsewhere closes the panel without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const close = () => {
    setOpenOn(null)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        className={triggerClassName}
        onClick={() => {
          setOpenOn(open ? null : pathname)
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          className={cn(
            'absolute z-50 mt-1 min-w-56 animate-in rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg fade-in-0 zoom-in-95',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}
