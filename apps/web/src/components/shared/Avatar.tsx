import { cn } from '@/lib/utils'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]]
  return letters
    .map((part) => part?.[0] ?? '')
    .join('')
    .toUpperCase()
}

export function Avatar({
  name,
  src,
  className,
}: {
  name: string
  src?: string | null
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-xs font-semibold text-primary',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials(name) || '?'
      )}
    </span>
  )
}
