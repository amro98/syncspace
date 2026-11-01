import type { WorkspaceMember } from '@syncspace/shared'

import { useChatStore } from '@/stores/chat-store'

import { describeTypers } from '../display'

/** Subscribes only to its own destination's typers (does not re-render the timeline). */
export function TypingIndicator({
  typingKey,
  viewerId,
  members,
}: {
  typingKey: string
  viewerId: string
  members: WorkspaceMember[] | undefined
}) {
  const userIds = useChatStore((state) => state.typing[typingKey])
  const names = (userIds ?? [])
    .filter((id) => id !== viewerId)
    .map((id) => members?.find((member) => member.id === id)?.name ?? 'Someone')
  const text = describeTypers(names)

  return (
    <div className="h-5 px-4 text-xs text-muted-foreground" aria-live="polite">
      {text}
    </div>
  )
}
