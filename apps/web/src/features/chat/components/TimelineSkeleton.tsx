import { Skeleton } from '@/components/ui/skeleton'

const ROWS = [72, 48, 88, 60, 40, 76]

/** Initial message-list placeholder (the shape of a conversation, not a spinner). */
export function TimelineSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-5 overflow-hidden px-4 py-4" role="status">
      <span className="sr-only">Loading messages</span>
      {ROWS.map((width, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3" style={{ width: `${String(width)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
