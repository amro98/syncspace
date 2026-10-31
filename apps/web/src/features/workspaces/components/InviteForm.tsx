import { zodResolver } from '@hookform/resolvers/zod'
import {
  ASSIGNABLE_WORKSPACE_ROLES,
  canGrantRole,
  createInviteInputSchema,
  type WorkspaceActor,
  type WorkspaceInvite,
} from '@syncspace/shared'
import { useMutation } from '@tanstack/react-query'
import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/components/AuthCard'
import { errorMessage } from '@/features/auth/messages'

import { createInvite } from '../api'

type FormValues = z.input<typeof createInviteInputSchema>

const ROLE_LABEL = { ADMIN: 'Admin', MEMBER: 'Member' } as const

/**
 * Invite by email. Role options come from the shared permission policy, so
 * an ADMIN only sees "Member" (the API enforces the same rule).
 */
export function InviteForm({ workspaceId, actor }: { workspaceId: string; actor: WorkspaceActor }) {
  const roles = ASSIGNABLE_WORKSPACE_ROLES.filter((role) => canGrantRole(actor, role))
  const [sent, setSent] = useState<WorkspaceInvite[]>([])

  const form = useForm<FormValues, unknown, z.output<typeof createInviteInputSchema>>({
    resolver: zodResolver(createInviteInputSchema),
    defaultValues: { email: '', role: 'MEMBER' },
  })
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof createInviteInputSchema>) =>
      createInvite(workspaceId, values),
    onSuccess: (invite) => {
      setSent((previous) => [invite, ...previous.filter((item) => item.email !== invite.email)])
      form.reset({ email: '', role: form.getValues('role') })
    },
  })

  if (roles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Only workspace owners and admins can invite people.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(event) => void form.handleSubmit((values) => mutation.mutate(values))(event)}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="invite-email" className="sr-only">
            Email address
          </Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="teammate@company.com"
            autoComplete="off"
            aria-invalid={form.formState.errors.email ? true : undefined}
            aria-describedby={form.formState.errors.email ? 'invite-email-error' : undefined}
            {...form.register('email')}
          />
          <FieldError id="invite-email-error" message={form.formState.errors.email?.message} />
        </div>
        <Label htmlFor="invite-role" className="sr-only">
          Role
        </Label>
        <select
          id="invite-role"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          {...form.register('role')}
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Sending…' : 'Send invite'}
        </Button>
      </form>

      {mutation.error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
        </Alert>
      )}

      {sent.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Invitations sent">
          {sent.map((invite) => (
            <li key={invite.id} className="flex items-center gap-2 text-sm">
              <MailCheck className="size-4 text-success" aria-hidden />
              <span className="truncate">Invited {invite.email}</span>
              <span className="text-xs text-muted-foreground">
                as {ROLE_LABEL[invite.role === 'ADMIN' ? 'ADMIN' : 'MEMBER']}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
