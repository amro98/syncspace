import { cn } from '@/lib/utils'
import { useRealtimeStore } from '@/stores/realtime-store'

/** Small live indicator: realtime connection + workspace room subscription. */
export function ConnectionStatus({ workspaceId }: { workspaceId: string }) {
  const connection = useRealtimeStore((state) => state.connection)
  const joined = useRealtimeStore((state) => state.joinedWorkspaceId === workspaceId)

  const live = connection === 'connected' && joined
  const label = live ? 'Live' : connection === 'disconnected' ? 'Offline' : 'Connecting…'

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          live && 'bg-success',
          connection === 'disconnected' && 'bg-danger',
          !live && connection !== 'disconnected' && 'animate-pulse bg-muted-foreground',
        )}
      />
      <span className="max-sm:sr-only">{label}</span>
    </div>
  )
}
