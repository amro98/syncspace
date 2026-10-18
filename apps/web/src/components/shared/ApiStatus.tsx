import { useApiHealth } from '@/hooks/use-api-health'
import { cn } from '@/lib/utils'

/** Small connectivity indicator proving the client can reach the API. */
export function ApiStatus() {
  const { isPending, isError } = useApiHealth()

  const label = isPending ? 'Connecting to API' : isError ? 'API offline' : 'API online'

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          isPending && 'animate-pulse bg-muted-foreground',
          !isPending && (isError ? 'bg-danger' : 'bg-success'),
        )}
      />
      <span className="max-sm:sr-only">{label}</span>
    </div>
  )
}
