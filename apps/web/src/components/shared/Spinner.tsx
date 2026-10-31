import { LoaderCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <LoaderCircle aria-hidden className={cn('size-4 animate-spin', className)} />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Shown while the session or a route's data bootstraps, so no protected UI flashes. */
export function FullPageSpinner({ label = 'Loading SyncSpace' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
      <Spinner className="size-6" label={label} />
    </div>
  )
}
