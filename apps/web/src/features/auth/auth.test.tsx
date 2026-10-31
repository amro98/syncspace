import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  apiError,
  authUser,
  ids,
  mockApi,
  renderRoute,
  signedInRoutes,
  signedOutRoutes,
} from '@/test/render'

const PASSWORD = 'Correct-Horse-9'

describe('route guards', () => {
  it('sends signed-out users to /login, remembering where they were going', async () => {
    mockApi(signedOutRoutes)
    const { router } = renderRoute(`/app/workspaces/${ids.workspace}/settings`)

    expect(await screen.findByRole('heading', { name: 'Sign in to SyncSpace' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe(
      `/app/workspaces/${ids.workspace}/settings`,
    )
  })

  it('sends signed-in users away from /login to their workspace', async () => {
    mockApi(signedInRoutes())
    const { router } = renderRoute('/login')

    expect(await screen.findByRole('heading', { name: 'Acme Inc.' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/app/workspaces/${ids.workspace}`)
  })
})

describe('login', () => {
  it('is password-manager friendly', async () => {
    mockApi(signedOutRoutes)
    renderRoute('/login')
    await screen.findByRole('heading', { name: 'Sign in to SyncSpace' })

    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Password')
    expect(email).toHaveAttribute('name', 'email')
    expect(email).toHaveAttribute('autocomplete', 'username')
    expect(password).toHaveAttribute('name', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(email.closest('form')).not.toBeNull()
  })

  it('signs in with Remember me and lands on onboarding when the user has no workspace', async () => {
    let signedIn = false
    const { calls } = mockApi({
      ...signedOutRoutes,
      'GET /auth/me': () =>
        signedIn ? { body: { user: authUser() } } : apiError('UNAUTHENTICATED', 401),
      'POST /auth/login': () => {
        signedIn = true
        return { body: { user: authUser() } }
      },
      'GET /workspaces': { body: { items: [], nextCursor: null } },
    })
    const user = userEvent.setup()
    const { router } = renderRoute('/login')
    await screen.findByRole('heading', { name: 'Sign in to SyncSpace' })

    await user.type(screen.getByLabelText('Email'), 'Ada@Example.com')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByLabelText('Remember me for 30 days'))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { name: /Welcome to SyncSpace, Ada/ }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app/onboarding')
    expect(calls.find((call) => call.path === '/auth/login')?.body).toEqual({
      email: 'ada@example.com',
      password: PASSWORD,
      rememberMe: true,
    })
  })

  it('shows the generic invalid-credentials message', async () => {
    mockApi({
      ...signedOutRoutes,
      'POST /auth/login': apiError('INVALID_CREDENTIALS', 401, 'Incorrect email or password.'),
    })
    const user = userEvent.setup()
    renderRoute('/login')
    await screen.findByRole('heading', { name: 'Sign in to SyncSpace' })

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument()
  })

  it('offers social-only users a way to set a password', async () => {
    mockApi({
      ...signedOutRoutes,
      'POST /auth/login': apiError(
        'PASSWORD_NOT_SET',
        401,
        'This account signs in with Google or GitHub.',
      ),
    })
    const user = userEvent.setup()
    renderRoute('/login')
    await screen.findByRole('heading', { name: 'Sign in to SyncSpace' })

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'whatever')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('link', { name: 'Set a password' })).toHaveAttribute(
      'href',
      '/forgot-password?email=ada%40example.com',
    )
  })

  it('explains OAuth errors returned to the login page', async () => {
    mockApi(signedOutRoutes)
    renderRoute('/login?error=OAUTH_EMAIL_UNVERIFIED')
    expect(await screen.findByText(/no verified email address/)).toBeInTheDocument()
  })

  it('starts social sign-in with the redirect and Remember me preserved', async () => {
    mockApi(signedOutRoutes)
    renderRoute('/login?redirect=/invite/abc')
    const google = await screen.findByRole('link', { name: 'Continue with Google' })
    const url = new URL(google.getAttribute('href') ?? '')
    expect(url.pathname).toBe('/auth/oauth/google')
    expect(url.searchParams.get('redirect')).toBe('/invite/abc')
    expect(url.searchParams.get('remember')).toBe('0')
  })
})

describe('register', () => {
  it('validates the password policy before calling the API', async () => {
    const { calls } = mockApi(signedOutRoutes)
    const user = userEvent.setup()
    renderRoute('/register')
    await screen.findByRole('heading', { name: 'Create your account' })

    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'weakpass')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText('An uppercase letter').closest('li')).toHaveTextContent('(not met)')
    expect(screen.getByText('A lowercase letter').closest('li')).toHaveTextContent('(met)')
    expect(calls.some((call) => call.path === '/auth/register')).toBe(false)
  })

  it('reports a duplicate email with a way to sign in', async () => {
    mockApi({
      ...signedOutRoutes,
      'POST /auth/register': apiError(
        'EMAIL_TAKEN',
        409,
        'An account with this email already exists.',
      ),
    })
    const user = userEvent.setup()
    renderRoute('/register')
    await screen.findByRole('heading', { name: 'Create your account' })

    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toBeInTheDocument()
  })
})

describe('forgot and reset password', () => {
  it('always shows the same confirmation after requesting a reset', async () => {
    mockApi({
      ...signedOutRoutes,
      'POST /auth/forgot-password': {
        status: 202,
        body: {
          message: 'If an account exists for that email, we sent a link to reset the password.',
        },
      },
    })
    const user = userEvent.setup()
    renderRoute('/forgot-password')
    await screen.findByRole('heading', { name: 'Reset your password' })

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText(/If an account exists for that email/)).toBeInTheDocument()
  })

  it('explains an expired reset link', async () => {
    mockApi({
      ...signedOutRoutes,
      'POST /auth/reset-password/verify': apiError(
        'RESET_TOKEN_EXPIRED',
        400,
        'This reset link has expired. Request a new one.',
      ),
    })
    renderRoute(`/reset-password?token=${'t'.repeat(43)}`)

    expect(
      await screen.findByText('This reset link has expired. Request a new one.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument()
  })

  it('sets a new password and returns to sign in with a confirmation', async () => {
    const token = 't'.repeat(43)
    const { calls } = mockApi({
      ...signedOutRoutes,
      'POST /auth/reset-password/verify': { body: { message: 'Reset link is valid.' } },
      'POST /auth/reset-password': {
        body: { message: 'Your password has been updated. Sign in with your new password.' },
      },
    })
    const user = userEvent.setup()
    const { router } = renderRoute(`/reset-password?token=${token}`)
    await screen.findByRole('heading', { name: 'Choose a new password' })

    await user.type(screen.getByLabelText('New password'), PASSWORD)
    await user.type(screen.getByLabelText('Confirm new password'), 'Different-Pass-1')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Confirm new password'))
    await user.type(screen.getByLabelText('Confirm new password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText(/Your password has been updated/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(calls.find((call) => call.path === '/auth/reset-password')?.body).toEqual({
      token,
      password: PASSWORD,
    })
  })
})

describe('social sign-in confirmation', () => {
  it('creates the account only after confirmation, then continues to the saved destination', async () => {
    let signedIn = false
    const { calls } = mockApi({
      ...signedOutRoutes,
      'GET /auth/me': () =>
        signedIn ? { body: { user: authUser() } } : apiError('UNAUTHENTICATED', 401),
      'GET /auth/oauth/pending': {
        body: {
          mode: 'signup',
          provider: 'GOOGLE',
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          avatarUrl: null,
        },
      },
      'POST /auth/oauth/pending/confirm': () => {
        signedIn = true
        return {
          body: {
            user: authUser({ hasPassword: false, providers: ['GOOGLE'] }),
            redirectTo: '/app',
          },
        }
      },
      'GET /workspaces': { body: { items: [], nextCursor: null } },
    })
    const user = userEvent.setup()
    const { router } = renderRoute('/auth/social/confirm')

    expect(await screen.findByRole('heading', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(calls.some((call) => call.path === '/auth/oauth/pending/confirm')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/onboarding')
    })
  })

  it('asks before linking a provider to an existing account, and cancelling creates nothing', async () => {
    const { calls } = mockApi({
      ...signedOutRoutes,
      'GET /auth/oauth/pending': {
        body: {
          mode: 'link',
          provider: 'GITHUB',
          email: 'ada@example.com',
          name: 'Ada',
          avatarUrl: null,
        },
      },
      'POST /auth/oauth/pending/cancel': { status: 204 },
    })
    const user = userEvent.setup()
    const { router } = renderRoute('/auth/social/link')

    expect(
      await screen.findByRole('heading', { name: 'An account already exists with this email.' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Link GitHub to your existing account\?/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link & Continue' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(calls.some((call) => call.path === '/auth/oauth/pending/confirm')).toBe(false)
  })
})

describe('sign out', () => {
  it('clears the session and returns to sign in', async () => {
    let signedIn = true
    mockApi({
      ...signedInRoutes(),
      'GET /auth/me': () =>
        signedIn ? { body: { user: authUser() } } : apiError('UNAUTHENTICATED', 401),
      'POST /auth/logout': () => {
        signedIn = false
        return { status: 204 }
      },
    })
    const user = userEvent.setup()
    const { router } = renderRoute(`/app/workspaces/${ids.workspace}`)
    await screen.findByRole('heading', { name: 'Acme Inc.' })

    await user.click(screen.getByRole('button', { name: /Account menu/ }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in to SyncSpace' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })
})
