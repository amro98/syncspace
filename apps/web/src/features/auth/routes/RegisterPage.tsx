import { zodResolver } from '@hookform/resolvers/zod'
import { registerInputSchema, safeRedirectPath } from '@syncspace/shared'
import { useMutation } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { z } from 'zod'

import { paths } from '@/app/router/paths'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isApiError } from '@/lib/api-client'

import { register as registerAccount } from '../api'
import { AuthCard, FieldError, OrDivider } from '../components/AuthCard'
import { PasswordChecklist } from '../components/PasswordChecklist'
import { PasswordInput } from '../components/PasswordInput'
import { SocialButtons } from '../components/SocialButtons'
import { useReplaceSession } from '../hooks'
import { errorMessage } from '../messages'

type RegisterFormValues = z.input<typeof registerInputSchema>

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const replaceSession = useReplaceSession()

  const rawRedirect = searchParams.get('redirect')
  const redirect = rawRedirect ? safeRedirectPath(rawRedirect) : undefined

  const form = useForm<RegisterFormValues, unknown, z.output<typeof registerInputSchema>>({
    resolver: zodResolver(registerInputSchema),
    defaultValues: {
      name: '',
      email: searchParams.get('email') ?? '',
      password: '',
      rememberMe: false,
    },
  })
  const { errors } = form.formState
  const password = useWatch({ control: form.control, name: 'password' })
  const remember = useWatch({ control: form.control, name: 'rememberMe' }) ?? false

  const mutation = useMutation({
    mutationFn: registerAccount,
    onSuccess: (user) => {
      replaceSession(user)
      void navigate(redirect ?? paths.app(), { replace: true })
    },
  })
  const emailTaken = isApiError(mutation.error) && mutation.error.code === 'EMAIL_TAKEN'

  return (
    <AuthCard
      title="Create your account"
      description="Bring your team's conversations and tasks together."
      footer={
        <>
          Already have an account?{' '}
          <Link to={paths.login({ redirect })} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {mutation.error && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{errorMessage(mutation.error)}</p>
            {emailTaken && (
              <Link to={paths.login({ redirect })} className="font-medium underline">
                Go to sign in
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      <SocialButtons redirect={redirect} remember={remember} />
      <OrDivider />

      <form
        method="post"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void form.handleSubmit((values) => mutation.mutate(values))(event)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="register-name">Name</Label>
          <Input
            id="register-name"
            autoComplete="name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'register-name-error' : undefined}
            {...form.register('name')}
          />
          <FieldError id="register-name-error" message={errors.name?.message} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'register-email-error' : undefined}
            {...form.register('email')}
          />
          <FieldError id="register-email-error" message={errors.email?.message} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="register-password">Password</Label>
          <PasswordInput
            id="register-password"
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby="register-password-rules"
            {...form.register('password')}
          />
          <PasswordChecklist id="register-password-rules" password={password} />
        </div>

        <Label htmlFor="register-remember" className="font-normal">
          <Checkbox id="register-remember" {...form.register('rememberMe')} />
          Remember me for 30 days
        </Label>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  )
}
