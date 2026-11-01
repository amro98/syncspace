const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

export function formatFullDate(iso: string): string {
  return fullFormat.format(new Date(iso))
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b))
}

/** "Today", "Yesterday", or "Monday, March 3". */
export function formatDayLabel(iso: string, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return dayFormat.format(new Date(iso))
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function formatRelative(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const units: [number, string][] = [
    [60, 'minute'],
    [24, 'hour'],
    [Number.POSITIVE_INFINITY, 'day'],
  ]
  let value = seconds / 60
  for (const [size, unit] of units) {
    if (value < size) {
      const rounded = Math.floor(value)
      return `${String(rounded)} ${unit}${rounded === 1 ? '' : 's'} ago`
    }
    value /= size
  }
  return 'a while ago'
}

export function formatCount(count: number, cap: number): string {
  return count >= cap ? `${String(cap - 1)}+` : String(count)
}
