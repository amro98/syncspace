import { cn } from '@/lib/utils'

/** Online/offline indicator. Always paired with text for screen readers (not color alone). */
export function PresenceDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full border-2 border-sidebar',
        online ? 'bg-success' : 'bg-muted-foreground/40',
        className,
      )}
    >
      <span className="sr-only">{online ? 'Online' : 'Offline'}</span>
    </span>
  )
}
