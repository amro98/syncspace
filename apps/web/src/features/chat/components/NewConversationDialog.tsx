import { LIMITS } from '@syncspace/shared'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { paths } from '@/app/router/paths'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession } from '@/features/auth/hooks'
import { errorMessage } from '@/features/auth/messages'

import { useStartConversation, useWorkspaceMembers } from '../hooks'
import { MemberPicker } from './MemberPicker'

/** Pick one person for a direct message, or several for a group conversation. */
export function NewConversationDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { data: user } = useSession()
  const members = useWorkspaceMembers(workspaceId)
  const start = useStartConversation(workspaceId)
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const others = (members.data ?? []).filter((member) => member.id !== user?.id)
  const isGroup = selected.length > 1
  const maxOthers = LIMITS.GROUP_CONVERSATION_MAX_PARTICIPANTS - 1
  const tooMany = selected.length > maxOthers

  const close = (next: boolean) => {
    if (!next) {
      setSelected([])
      setName('')
      start.reset()
    }
    onOpenChange(next)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="New message"
      description="Choose one person for a direct message, or several to start a group."
    >
      <div className="flex flex-col gap-4">
        {start.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(start.error)}</AlertDescription>
          </Alert>
        )}
        {selected.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected people">
            {selected.map((id) => {
              const member = others.find((m) => m.id === id)
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-label={`Remove ${member?.name ?? 'person'}`}
                    className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-secondary/80"
                    onClick={() => {
                      setSelected((ids) => ids.filter((x) => x !== id))
                    }}
                  >
                    {member?.name ?? 'Unknown'}
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <MemberPicker
          members={others}
          selected={selected}
          emptyText={members.isPending ? 'Loading people…' : 'Nobody matches that search.'}
          onToggle={(member) => {
            setSelected((ids) =>
              ids.includes(member.id) ? ids.filter((id) => id !== member.id) : [...ids, member.id],
            )
          }}
        />
        {isGroup && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="group-name">
              Group name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="group-name"
              value={name}
              maxLength={LIMITS.CONVERSATION_NAME_MAX}
              placeholder="e.g. Launch crew"
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
          </div>
        )}
        {tooMany && (
          <p className="text-xs text-danger" role="alert">
            Groups can include at most {maxOthers} other people.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              close(false)
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={selected.length === 0 || tooMany || start.isPending}
            onClick={() => {
              start.mutate(
                { userIds: selected, ...(isGroup && name.trim() && { name: name.trim() }) },
                {
                  onSuccess: (conversation) => {
                    close(false)
                    void navigate(paths.dm(workspaceId, conversation.id))
                  },
                },
              )
            }}
          >
            {start.isPending ? 'Opening…' : isGroup ? 'Start group' : 'Open conversation'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
