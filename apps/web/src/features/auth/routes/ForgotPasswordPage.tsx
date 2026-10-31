import { zodResolver } from '@hookform/resolvers/zod'
import { forgotPasswordInputSchema } from '@syncspace/shared'
import { useMutation } from '@tanstack/react-query'
import { MailCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router'
import type { z } from 'zod'

import { paths } from '@/app/router/paths'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { requestPasswordReset } from '../api'
import { AuthCard, FieldError } from '../components/AuthCard'
import { errorMessage } from '../messages'

type ForgotFormValues = z.input<typeof forgotPasswordInputSchema>

export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams()
  const form = useForm<ForgotFormValues, unknown, z.output<typeof forgotPasswordInputSchema>>({
    resolver: zodResolver(forgotPasswordInputSchema),
    defaultValues: { email: searchParams.get('email') ?? '' },
  })
  const mutation = useMutation({ mutationFn: requestPasswordReset })
  const backToLogin = (
    <Link to={paths.login()} className="font-medium text-primary hover:underline">
      Back to sign in
    </Link>
  )

  if (mutation.isSuccess) {
    return (
      <AuthCard title="Check your email" footer={backToLogin}>
        <Alert variant="success">
          <MailCheck aria-hidden />
          <AlertDescription>
            <p>{mutation.data.message}</p>
            <p>The link expires in 30 minutes. Check your spam folder if it does not arrive.</p>
          </AlertDescription>
        </Alert>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account email and we’ll send you a link to set a new password. This also works if you usually sign in with Google or GitHub."
      footer={backToLogin}
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
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={form.formState.errors.email ? true : undefined}
            aria-describedby={form.formState.errors.email ? 'forgot-email-error' : undefined}
            {...form.register('email')}
          />
          <FieldError id="forgot-email-error" message={form.formState.errors.email?.message} />
        </div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthCard>
  )
}
