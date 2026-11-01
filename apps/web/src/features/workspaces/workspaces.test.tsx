import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { useWorkspacePrefsStore } from '@/stores/workspace-prefs-store'
import {
  apiError,
  authUser,
  ids,
  mockApi,
  renderRoute,
  signedInRoutes,
  signedOutRoutes,
  workspaceDetail,
} from '@/test/render'

const acme = workspaceDetail()
const globex = workspaceDetail({
  id: ids.otherWorkspace,
  name: 'Globex',
  slug: 'globex',
  role: 'MEMBER',
})

describe('/app default destination', () => {
  it('sends users without workspaces to onboarding', async () => {
    mockApi(signedInRoutes({ workspaces: [] }))
    const { router } = renderRoute('/app')

    expect(await screen.findByRole('heading', { name: /Welcome to SyncSpace/ })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app/onboarding')
  })

  it('opens the last workspace when the user still belongs to it', async () => {
    useWorkspacePrefsStore.setState({ lastWorkspaceId: globex.id })
    mockApi(signedInRoutes({ workspaces: [acme, globex] }))
    const { router } = renderRoute('/app')

    expect(await screen.findByRole('heading', { name: 'Globex' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/app/workspaces/${globex.id}/overview`)
  })

  it('ignores a remembered workspace the user no longer belongs to', async () => {
    useWorkspacePrefsStore.setState({ lastWorkspaceId: '01920000-7c00-7000-8000-0000000000ff' })
    mockApi(signedInRoutes({ workspaces: [acme] }))
    const { router } = renderRoute('/app')

    await screen.findByRole('heading', { name: 'Acme Inc.' })
    expect(router.state.location.pathname).toBe(`/app/workspaces/${acme.id}/overview`)
  })
})

describe('onboarding', () => {
  it('creates a workspace with an auto-generated slug, offers invites, then opens it', async () => {
    const created = workspaceDetail({ name: 'Rocket Team', slug: 'rocket-team' })
    const { calls } = mockApi({
      ...signedInRoutes({ workspaces: [] }),
      'POST /workspaces': { status: 201, body: created },
      [`GET /workspaces/${created.id}`]: { body: created },
      [`POST /workspaces/${created.id}/invites`]: ({ body }) => ({
        status: 201,
        body: {
          id: '01920000-7c00-7000-8000-0000000000c1',
          email: (body as { email: string }).email,
          role: 'MEMBER',
          expiresAt: '2026-02-01T00:00:00.000Z',
          createdAt: '2026-01-25T00:00:00.000Z',
        },
      }),
    })
    const user = userEvent.setup()
    const { router } = renderRoute('/app/onboarding')

    await user.click(await screen.findByRole('button', { name: /Get started/ }))
    await user.type(screen.getByLabelText('Workspace name'), 'Rocket Team')
    expect(screen.getByLabelText('Workspace URL')).toHaveValue('rocket-team')
    await user.click(screen.getByRole('button', { name: 'Create workspace' }))

    expect(
      await screen.findByRole('heading', { name: 'Invite your teammates' }),
    ).toBeInTheDocument()
    expect(
      calls.find((call) => call.path === '/workspaces' && call.method === 'POST')?.body,
    ).toEqual({
      name: 'Rocket Team',
      slug: 'rocket-team',
    })

    await user.type(screen.getByLabelText('Email address'), 'grace@example.com')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByText('Invited grace@example.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Go to Rocket Team/ }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/app/workspaces/${created.id}/overview`)
    })
    expect(useWorkspacePrefsStore.getState().lastWorkspaceId).toBe(created.id)
  })

  it('shows a slug conflict on the URL field', async () => {
    mockApi({
      ...signedInRoutes({ workspaces: [] }),
      'POST /workspaces': apiError(
        'SLUG_TAKEN',
        409,
        'That workspace URL is already taken. Try another.',
      ),
    })
    const user = userEvent.setup()
    renderRoute('/app/onboarding?step=create')

    await user.type(await screen.findByLabelText('Workspace name'), 'Acme')
    await user.click(screen.getByRole('button', { name: 'Create workspace' }))

    expect(
      await screen.findByText('That workspace URL is already taken. Try another.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Workspace URL')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('workspace switcher and access', () => {
  it('lists the user’s workspaces with roles and switches by URL', async () => {
    mockApi(signedInRoutes({ workspaces: [acme, globex] }))
    const user = userEvent.setup()
    const { router } = renderRoute(`/app/workspaces/${acme.id}`)
    await screen.findByRole('heading', { name: 'Acme Inc.' })

    await user.click(screen.getByRole('button', { name: /Switch workspace/ }))
    const list = screen.getByRole('navigation', { name: 'Your workspaces' })
    expect(within(list).getByRole('link', { name: /Acme Inc\..*Owner/ })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await user.click(within(list).getByRole('link', { name: /Globex.*Member/ }))
    expect(await screen.findByRole('heading', { name: 'Globex' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/app/workspaces/${globex.id}/overview`)
  })

  it('shows a friendly page for workspaces the user cannot access', async () => {
    mockApi({
      ...signedInRoutes({ workspaces: [acme] }),
      [`GET /workspaces/${globex.id}`]: apiError('NOT_FOUND', 404, 'Workspace not found'),
    })
    renderRoute(`/app/workspaces/${globex.id}`)

    expect(
      await screen.findByRole('heading', { name: 'Workspace unavailable' }),
    ).toBeInTheDocument()
  })

  it('offers admins only the roles they may grant', async () => {
    const asAdmin = workspaceDetail({ role: 'ADMIN' })
    mockApi(signedInRoutes({ workspaces: [asAdmin] }))
    renderRoute(`/app/workspaces/${asAdmin.id}/settings`)

    const role = await screen.findByLabelText('Role')
    expect(
      within(role)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Member'])
  })

  it('tells members they cannot invite', async () => {
    const asMember = workspaceDetail({ role: 'MEMBER' })
    mockApi(signedInRoutes({ workspaces: [asMember] }))
    renderRoute(`/app/workspaces/${asMember.id}/settings`)

    expect(
      await screen.findByText('Only workspace owners and admins can invite people.'),
    ).toBeInTheDocument()
  })
})

describe('invitations', () => {
  const token = 'i'.repeat(43)
  const preview = {
    workspace: { id: acme.id, name: 'Acme Inc.' },
    inviterName: 'Grace Hopper',
    role: 'MEMBER',
    email: 'ada@example.com',
    status: 'PENDING',
    expiresAt: '2026-02-01T00:00:00.000Z',
  }

  it('sends signed-out invitees to sign in or sign up and back to the invitation', async () => {
    mockApi({ ...signedOutRoutes, 'POST /invites/preview': { body: preview } })
    renderRoute(`/invite/${token}`)

    expect(await screen.findByRole('heading', { name: 'Join Acme Inc.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in to accept' })).toHaveAttribute(
      'href',
      `/login?redirect=%2Finvite%2F${token}`,
    )
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      `/register?redirect=%2Finvite%2F${token}&email=ada%40example.com`,
    )
  })

  it('accepts for the invited user and opens the workspace', async () => {
    const { calls } = mockApi({
      ...signedInRoutes({ workspaces: [acme] }),
      'POST /invites/preview': { body: preview },
      'POST /invites/accept': { body: { workspaceId: acme.id } },
    })
    const user = userEvent.setup()
    const { router } = renderRoute(`/invite/${token}`)

    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/app/workspaces/${acme.id}/overview`)
    })
    expect(calls.find((call) => call.path === '/invites/accept')?.body).toEqual({ token })
  })

  it('explains when the signed-in account is not the invited email', async () => {
    mockApi({
      ...signedInRoutes({ user: authUser({ email: 'someone@else.com' }) }),
      'POST /invites/preview': { body: preview },
    })
    renderRoute(`/invite/${token}`)

    expect(await screen.findByText(/but this invitation is for/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out and switch account' })).toBeInTheDocument()
  })

  it('shows expired invitations', async () => {
    mockApi({
      ...signedOutRoutes,
      'POST /invites/preview': { body: { ...preview, status: 'EXPIRED' } },
    })
    renderRoute(`/invite/${token}`)
    expect(await screen.findByText(/This invitation has expired/)).toBeInTheDocument()
  })
})
