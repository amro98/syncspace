import { zodResolver } from '@hookform/resolvers/zod'
import {
  createWorkspaceInputSchema,
  LIMITS,
  slugify,
  type WorkspaceDetail,
} from '@syncspace/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/components/AuthCard'
import { errorMessage } from '@/features/auth/messages'
import { isApiError } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

import { createWorkspace } from '../api'

type FormValues = z.input<typeof createWorkspaceInputSchema>

/**
 * Name + URL slug. The slug follows the name until the user edits it, and is
 * validated with the same schema (and database constraint) as the API.
 */
export function CreateWorkspaceForm({
  onCreated,
}: {
  onCreated: (workspace: WorkspaceDetail) => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<FormValues, unknown, z.output<typeof createWorkspaceInputSchema>>({
    resolver: zodResolver(createWorkspaceInputSchema),
    defaultValues: { name: '', slug: '' },
  })
  const { errors, dirtyFields } = form.formState
  const nameField = form.register('name', {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      if (!dirtyFields.slug) {
        form.setValue('slug', slugify(event.target.value), {
          shouldValidate: form.formState.isSubmitted,
        })
      }
    },
  })

  const mutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: async (workspace) => {
      queryClient.setQueryData(queryKeys.workspaces.detail(workspace.id), workspace)
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list() })
      onCreated(workspace)
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'SLUG_TAKEN') {
        form.setError('slug', { message: error.message })
      }
    },
  })
  const slugTaken = isApiError(mutation.error) && mutation.error.code === 'SLUG_TAKEN'

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => void form.handleSubmit((values) => mutation.mutate(values))(event)}
    >
      {mutation.error && !slugTaken && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          autoComplete="organization"
          placeholder="Acme Inc."
          maxLength={LIMITS.WORKSPACE_NAME_MAX}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'workspace-name-error' : undefined}
          {...nameField}
        />
        <FieldError id="workspace-name-error" message={errors.name?.message} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-slug">Workspace URL</Label>
        <div className="flex items-center rounded-md border border-input shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
          <span className="pl-3 text-sm text-muted-foreground">syncspace/</span>
          <Input
            id="workspace-slug"
            autoComplete="off"
            spellCheck={false}
            maxLength={LIMITS.SLUG_MAX}
            className="border-0 pl-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby="workspace-slug-hint"
            {...form.register('slug', {
              setValueAs: (value: string) => value.toLowerCase(),
            })}
          />
        </div>
        {errors.slug ? (
          <FieldError id="workspace-slug-hint" message={errors.slug.message} />
        ) : (
          <p id="workspace-slug-hint" className="text-xs text-muted-foreground">
            Lowercase letters, numbers and hyphens.
          </p>
        )}
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating…' : 'Create workspace'}
      </Button>
    </form>
  )
}
