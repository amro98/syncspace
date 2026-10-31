import { zodResolver } from '@hookform/resolvers/zod'
import { loginInputSchema, safeRedirectPath } from '@syncspace/shared'
import { useMutation } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import type { z } from 'zod'

import { paths } from '@/app/router/paths'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isApiError } from '@/lib/api-client'

import { login } from '../api'
import { AuthCard, FieldError, OrDivider } from '../components/AuthCard'
import { PasswordInput } from '../components/PasswordInput'
import { SocialButtons } from '../components/SocialButtons'
import { useReplaceSession } from '../hooks'
import { errorMessage, oauthRedirectError } from '../messages'

type LoginFormValues = z.input<typeof loginInputSchema>

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const replaceSession = useReplaceSession()

  const rawRedirect = searchParams.get('redirect')
  const redirect = rawRedirect ? safeRedirectPath(rawRedirect) : undefined
  const notice = (location.state as { notice?: string } | null)?.notice
  const oauthError = oauthRedirectError(searchParams.get('error'))

  const form = useForm<LoginFormValues, unknown, z.output<typeof loginInputSchema>>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: searchParams.get('email') ?? '', password: '', rememberMe: false },
  })
  const { errors } = form.formState
  const remember = useWatch({ control: form.control, name: 'rememberMe' }) ?? false
  const email = useWatch({ control: form.control, name: 'email' })

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      replaceSession(user)
      void navigate(redirect ?? paths.app(), { replace: true })
    },
  })

  const failure = mutation.error
  const passwordNotSet = isApiError(failure) && failure.code === 'PASSWORD_NOT_SET'

  return (
    <AuthCard
      title="Sign in to SyncSpace"
      description="Welcome back. Pick up where your team left off."
      footer={
        <>
          New to SyncSpace?{' '}
          <Link
            to={paths.register({ redirect })}
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {notice && (
        <Alert variant="success">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {oauthError && !failure && (
        <Alert variant="destructive">
          <AlertDescription>{oauthError}</AlertDescription>
        </Alert>
      )}
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{errorMessage(failure)}</p>
            {passwordNotSet && (
              <Link
                to={paths.forgotPassword({ email: form.getValues('email') })}
                className="font-medium underline"
              >
                Set a password
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
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            {...form.register('email')}
          />
          <FieldError id="login-email-error" message={errors.email?.message} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <Link
              to={paths.forgotPassword({ email: email || undefined })}
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            {...form.register('password')}
          />
          <FieldError id="login-password-error" message={errors.password?.message} />
        </div>

        <Label htmlFor="login-remember" className="font-normal">
          <Checkbox id="login-remember" {...form.register('rememberMe')} />
          Remember me for 30 days
        </Label>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  )
}
