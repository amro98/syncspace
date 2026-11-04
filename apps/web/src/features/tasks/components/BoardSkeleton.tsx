import { Skeleton } from '@/components/ui/skeleton'

const COLUMNS = [3, 2, 1]

/** First-load placeholder in the shape of a board (header, filters, columns). */
export function BoardSkeleton() {
  return (
    <div className="flex h-full flex-col" role="status">
      <span className="sr-only">Loading board</span>
      <div className="flex h-(--topbar-height) items-center gap-2 border-b px-4">
        <Skeleton className="size-4" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="px-4 py-3">
        <Skeleton className="h-8 w-72 max-w-full" />
      </div>
      <div className="flex gap-3 overflow-hidden px-4">
        {COLUMNS.map((cards, column) => (
          <div
            key={column}
            className="flex w-[85vw] shrink-0 flex-col gap-2 rounded-xl bg-muted/60 p-2 sm:w-72"
          >
            <Skeleton className="h-4 w-24 bg-muted-foreground/15" />
            {Array.from({ length: cards }, (_, card) => (
              <Skeleton key={card} className="h-20 bg-card" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
