import { zodResolver } from '@hookform/resolvers/zod'
import { passwordSchema } from '@syncspace/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'

import { paths } from '@/app/router/paths'
import { Spinner } from '@/components/shared/Spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { queryKeys } from '@/lib/query-keys'

import { resetPassword, verifyResetToken } from '../api'
import { AuthCard, FieldError } from '../components/AuthCard'
import { PasswordChecklist } from '../components/PasswordChecklist'
import { PasswordInput } from '../components/PasswordInput'
import { useReplaceSession } from '../hooks'
import { errorMessage } from '../messages'

const resetFormSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

type ResetFormValues = z.infer<typeof resetFormSchema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const replaceSession = useReplaceSession()

  const verification = useQuery({
    queryKey: queryKeys.auth.resetToken(token),
    queryFn: () => verifyResetToken(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  })

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const password = useWatch({ control: form.control, name: 'password' })

  const mutation = useMutation({
    mutationFn: (values: ResetFormValues) => resetPassword({ token, password: values.password }),
    onSuccess: (result) => {
      // Every session was revoked server-side; mirror that locally.
      replaceSession(null)
      void navigate(paths.login(), { replace: true, state: { notice: result.message } })
    },
  })

  const requestNewLink = (
    <Link to={paths.forgotPassword()} className={buttonVariants({ variant: 'outline' })}>
      Request a new link
    </Link>
  )

  if (!token) {
    return (
      <AuthCard title="Reset link missing">
        <Alert variant="destructive">
          <AlertDescription>
            Open the link from your reset email, or request a new one.
          </AlertDescription>
        </Alert>
        {requestNewLink}
      </AuthCard>
    )
  }

  if (verification.isPending) {
    return (
      <AuthCard title="Checking your reset link">
        <Spinner label="Checking reset link" />
      </AuthCard>
    )
  }

  const tokenError = verification.error ?? mutation.error
  const tokenUnusable =
    verification.isError ||
    (mutation.error !== null &&
      ['RESET_TOKEN_INVALID', 'RESET_TOKEN_EXPIRED', 'RESET_TOKEN_USED'].includes(
        mutation.error.code,
      ))

  if (tokenUnusable) {
    return (
      <AuthCard title="This reset link can’t be used">
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(tokenError)}</AlertDescription>
        </Alert>
        {requestNewLink}
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="Signing in with the new password works right away. Other devices will be signed out."
    >
      {mutation.error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
        </Alert>
      )}
      <form
        method="post"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void form.handleSubmit((values) => mutation.mutate(values))(event)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-password">New password</Label>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            aria-describedby="reset-password-rules"
            aria-invalid={form.formState.errors.password ? true : undefined}
            {...form.register('password')}
          />
          <PasswordChecklist id="reset-password-rules" password={password} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-confirm">Confirm new password</Label>
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            aria-invalid={form.formState.errors.confirmPassword ? true : undefined}
            aria-describedby={
              form.formState.errors.confirmPassword ? 'reset-confirm-error' : undefined
            }
            {...form.register('confirmPassword')}
          />
          <FieldError
            id="reset-confirm-error"
            message={form.formState.errors.confirmPassword?.message}
          />
        </div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
    </AuthCard>
  )
}
