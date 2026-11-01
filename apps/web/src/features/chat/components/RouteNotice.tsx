import { Info, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

export interface NoticeState {
  notice?: string
}

/** Shows a one-off notice passed through navigation state (e.g. "you lost access to that channel"). */
export function RouteNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const notice = (location.state as NoticeState | null)?.notice
  if (!notice) return null

  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b bg-muted/60 px-4 py-2 text-sm text-muted-foreground"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="flex-1">{notice}</p>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded p-0.5 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => {
          void navigate(
            { pathname: location.pathname, search: location.search },
            { replace: true, state: null },
          )
        }}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
