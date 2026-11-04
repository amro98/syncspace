import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useEffect } from 'react'

import { cn } from '@/lib/utils'
import { type Toast, useToastStore } from '@/stores/toast-store'

const DURATION = { error: 7000, success: 4000, info: 5000 } as const
const ICONS = { error: CircleAlert, success: CircleCheck, info: Info } as const

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss)
  useEffect(() => {
    const timer = setTimeout(() => {
      dismiss(toast.id)
    }, DURATION[toast.tone])
    return () => {
      clearTimeout(timer)
    }
  }, [toast.id, toast.tone, dismiss])
  const Icon = ICONS[toast.tone]
  return (
    <li
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg',
        toast.tone === 'error' && 'border-danger/40',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          toast.tone === 'error'
            ? 'text-danger'
            : toast.tone === 'success'
              ? 'text-success'
              : 'text-primary',
        )}
        aria-hidden
      />
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => {
          dismiss(toast.id)
        }}
        className="rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  )
}

/** Bottom-right on desktop, bottom full-width on mobile. Mounted once by the app. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  return (
    <ol
      aria-label="Status messages"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-2 p-4 sm:inset-x-auto sm:right-0 sm:w-96"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </ol>
  )
}
