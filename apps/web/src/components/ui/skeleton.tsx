import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** Placeholder block for content that is loading (decorative: hidden from assistive tech). */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }

/** A few placeholder rows for a navigation or inbox list. */
function ListSkeleton({
  rows = 3,
  label,
  className,
}: {
  rows?: number
  label: string
  className?: string
}) {
  return (
    <div role="status" className={cn('flex flex-col gap-2 px-3 py-1', className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2">
          <Skeleton className="size-4 shrink-0 rounded" />
          <Skeleton className="h-3" style={{ width: `${String(55 + ((index * 17) % 35))}%` }} />
        </div>
      ))}
    </div>
  )
}

export { ListSkeleton }
