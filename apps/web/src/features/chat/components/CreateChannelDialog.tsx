import { zodResolver } from '@hookform/resolvers/zod'
import { createChannelInputSchema } from '@syncspace/shared'
import { Hash, Lock } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import type { z } from 'zod'

import { paths } from '@/app/router/paths'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/components/AuthCard'
import { errorMessage } from '@/features/auth/messages'
import { cn } from '@/lib/utils'

import { useCreateChannel } from '../hooks'

type FormValues = z.input<typeof createChannelInputSchema>

const TYPES = [
  {
    value: 'PUBLIC',
    label: 'Public',
    icon: Hash,
    help: 'Anyone in the workspace can find, read and post.',
  },
  {
    value: 'PRIVATE',
    label: 'Private',
    icon: Lock,
    help: 'Only people you add can see it. Workspace admins can still review it.',
  },
] as const

export function CreateChannelDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const mutation = useCreateChannel(workspaceId)
  const form = useForm<FormValues, unknown, z.output<typeof createChannelInputSchema>>({
    resolver: zodResolver(createChannelInputSchema),
    defaultValues: { name: '', description: '', type: 'PUBLIC' },
  })
  const type = useWatch({ control: form.control, name: 'type' })
  const { errors } = form.formState

  const close = (next: boolean) => {
    if (!next) {
      form.reset()
      mutation.reset()
    }
    onOpenChange(next)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Create a channel"
      description="Channels are where your team talks about a topic."
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(({ description, ...values }) => {
          mutation.mutate(description ? { ...values, description } : values, {
            onSuccess: (channel) => {
              close(false)
              void navigate(paths.channel(workspaceId, channel.id))
            },
          })
        })}
      >
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="channel-name">Name</Label>
          <Input
            id="channel-name"
            placeholder="e.g. design-reviews"
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'channel-name-error' : undefined}
            {...form.register('name')}
          />
          <FieldError id="channel-name-error" message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="channel-description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="channel-description"
            placeholder="What is this channel about?"
            aria-invalid={errors.description ? true : undefined}
            {...form.register('description')}
          />
          <FieldError id="channel-description-error" message={errors.description?.message} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Visibility</legend>
          {TYPES.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
                type === option.value && 'border-primary bg-primary/5',
              )}
            >
              <input
                type="radio"
                value={option.value}
                className="sr-only"
                {...form.register('type')}
              />
              <option.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-muted-foreground">{option.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              close(false)
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create channel'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
