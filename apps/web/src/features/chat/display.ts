import type { SearchResult } from '@syncspace/shared'

import { paths } from '@/app/router/paths'

// Pure display helpers for chat components (kept out of component files for fast refresh).

/** A small curated set: enough for reactions without shipping an emoji database. */
export const QUICK_EMOJIS = [
  ['👍', 'thumbs up'],
  ['❤️', 'heart'],
  ['😂', 'laughing'],
  ['🎉', 'party'],
  ['😮', 'surprised'],
  ['😢', 'sad'],
  ['🙏', 'thank you'],
  ['👀', 'eyes'],
  ['🔥', 'fire'],
  ['✅', 'done'],
  ['🚀', 'rocket'],
  ['💯', 'hundred'],
  ['👏', 'clap'],
  ['🙌', 'raised hands'],
  ['🤔', 'thinking'],
  ['😄', 'smile'],
] as const

export function describeTypers(names: string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) return `${names[0] ?? ''} is typing…`
  if (names.length === 2) return `${names[0] ?? ''} and ${names[1] ?? ''} are typing…`
  return 'Several people are typing…'
}

/** Where a result opens: its destination, with the thread panel showing the message. */
export function searchResultPath(workspaceId: string, result: SearchResult): string {
  const base =
    result.destination.kind === 'channel'
      ? paths.channel(workspaceId, result.destination.id)
      : paths.dm(workspaceId, result.destination.id)
  return `${base}?thread=${encodeURIComponent(result.parentMessageId ?? result.messageId)}`
}
