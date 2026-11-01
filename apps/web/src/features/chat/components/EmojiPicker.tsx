import { SmilePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { QUICK_EMOJIS } from '../display'

export function EmojiPicker({
  onPick,
  label = 'Add reaction',
  className,
}: {
  onPick: (emoji: string) => void
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => {
          setOpen((value) => !value)
        }}
      >
        <SmilePlus className="size-4" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Emoji"
          className="absolute right-0 bottom-full z-40 mb-1 grid w-max grid-cols-8 gap-0.5 rounded-lg border bg-popover p-1.5 shadow-lg"
        >
          {QUICK_EMOJIS.map(([emoji, name]) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              aria-label={`React with ${name}`}
              className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => {
                onPick(emoji)
                setOpen(false)
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
