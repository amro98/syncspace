import { CLIENT_EVENTS, SERVER_EVENTS } from '@syncspace/shared'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  channelPath,
  channelSummary,
  chatBase,
  chatIds,
  chatRoutes,
  message,
} from '@/test/chat-fixtures'
import { fakeSocket, serverEmit, simulateDisconnect, simulateReconnect } from '@/test/fake-socket'
import {
  apiError,
  authUser,
  ids,
  mockApi,
  renderRoute,
  signedInRoutes,
  workspaceDetail,
} from '@/test/render'

const general = channelSummary()
const random = channelSummary({ id: chatIds.random, name: 'random', slug: 'random' })

const roomCalls = (event: string) =>
  fakeSocket.emitWithAck.mock.calls.filter(([name]) => name === event).map(([, payload]) => payload)

const sidebarLink = (name: RegExp) =>
  within(screen.getByRole('list', { name: 'Channels' })).getByRole('link', { name })

describe('socket listeners and rooms', () => {
  it('handles each event once after many navigations, even under StrictMode', async () => {
    const user = userEvent.setup()
    mockApi(
      chatRoutes({
        channels: [
          general,
          random,
          channelSummary({ id: chatIds.secret, name: 'ops', slug: 'ops' }),
        ],
      }),
    )
    renderRoute(channelPath(general.id), { strict: true })
    await screen.findByRole('heading', { level: 1, name: /general/ })

    // Bounce between channels: every visit mounts and unmounts listeners.
    for (const name of [/random/, /general/, /random/, /general/]) {
      await user.click(sidebarLink(name))
      await screen.findByRole('heading', { level: 1, name })
    }

    act(() => {
      serverEmit(SERVER_EVENTS.MESSAGE_CREATED, {
        message: message({ content: 'once', destination: { kind: 'channel', id: chatIds.secret } }),
        clientMessageId: null,
        parent: null,
      })
    })
    // One event → exactly one unread, not one per leaked listener.
    await waitFor(() => {
      expect(within(sidebarLink(/ops/)).getByText('1')).toBeInTheDocument()
    })
  })

  it('leaves the previous channel room when switching and rejoins only current rooms after a reconnect', async () => {
    const user = userEvent.setup()
    mockApi(chatRoutes({ channels: [general, random] }))
    renderRoute(channelPath(general.id))
    await screen.findByText('Live')
    await waitFor(() => {
      expect(roomCalls(CLIENT_EVENTS.CHANNEL_JOIN)).toContainEqual({
        workspaceId: ids.workspace,
        channelId: general.id,
      })
    })

    await user.click(sidebarLink(/random/))
    await screen.findByRole('heading', { level: 1, name: /random/ })
    await waitFor(() => {
      expect(roomCalls(CLIENT_EVENTS.CHANNEL_LEAVE)).toContainEqual({
        workspaceId: ids.workspace,
        channelId: general.id,
      })
    })

    fakeSocket.emitWithAck.mockClear()
    act(() => {
      simulateDisconnect()
    })
    await screen.findByText('Offline')
    act(() => {
      simulateReconnect()
    })
    await screen.findByText('Live')
    await waitFor(() => {
      expect(roomCalls(CLIENT_EVENTS.CHANNEL_JOIN)).toEqual([
        { workspaceId: ids.workspace, channelId: random.id },
      ])
    })
    expect(roomCalls(CLIENT_EVENTS.WORKSPACE_JOIN)).toEqual([{ workspaceId: ids.workspace }])
  })

  it('leaves the old workspace room and shows none of its data after switching workspaces', async () => {
    const user = userEvent.setup()
    const acme = workspaceDetail()
    const globex = workspaceDetail({ id: ids.otherWorkspace, name: 'Globex', slug: 'globex' })
    const routes = {
      ...chatRoutes({ channels: [general] }),
      ...Object.fromEntries(
        Object.entries(signedInRoutes({ workspaces: [acme, globex] })).filter(
          ([key]) => key === 'GET /workspaces',
        ),
      ),
      [`GET /workspaces/${globex.id}`]: { body: globex },
      [`GET /workspaces/${globex.id}/channels`]: {
        body: {
          items: [
            channelSummary({
              id: chatIds.random,
              workspaceId: globex.id,
              name: 'globex-only',
              slug: 'globex-only',
            }),
          ],
        },
      },
      [`GET /workspaces/${globex.id}/conversations`]: { body: { items: [] } },
      [`GET /workspaces/${globex.id}/members`]: { body: { items: [] } },
      [`GET /workspaces/${globex.id}/boards`]: { body: { items: [] } },
      [`GET /workspaces/${globex.id}/channels/${chatIds.random}/messages`]: {
        body: { items: [], nextCursor: null },
      },
    }
    mockApi(routes)
    const { router } = renderRoute(channelPath(general.id))
    await screen.findByRole('heading', { level: 1, name: /general/ })

    await user.click(screen.getByRole('button', { name: /Switch workspace/ }))
    await user.click(
      within(screen.getByRole('navigation', { name: 'Your workspaces' })).getByRole('link', {
        name: /Globex/,
      }),
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toContain(globex.id)
    })
    expect(await screen.findByRole('link', { name: /globex-only/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^general/ })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(roomCalls(CLIENT_EVENTS.WORKSPACE_LEAVE)).toContainEqual({
        workspaceId: ids.workspace,
      })
    })
  })
})

describe('identity changes', () => {
  it('shows nothing of the previous user after signing out and in as someone else', async () => {
    const user = userEvent.setup()
    const grace = authUser({ id: ids.otherUser, name: 'Grace Hopper', email: 'grace@example.com' })
    let current: ReturnType<typeof authUser> | null = authUser()
    const graceWorkspace = workspaceDetail({
      id: ids.otherWorkspace,
      name: 'Grace Labs',
      slug: 'grace-labs',
    })
    const routes = chatRoutes({
      channels: [channelSummary({ name: 'ada-secret-channel', slug: 'ada-secret-channel' })],
    })
    mockApi({
      ...routes,
      'GET /auth/me': () =>
        current ? { body: { user: current } } : apiError('UNAUTHENTICATED', 401),
      'POST /auth/logout': () => {
        current = null
        return { status: 204 }
      },
      'POST /auth/login': () => {
        current = grace
        return { body: { user: grace } }
      },
      'GET /workspaces': () =>
        current?.id === grace.id
          ? {
              body: {
                items: [
                  {
                    id: graceWorkspace.id,
                    name: 'Grace Labs',
                    slug: 'grace-labs',
                    role: 'OWNER',
                    memberCount: 1,
                  },
                ],
                nextCursor: null,
              },
            }
          : (routes['GET /workspaces'] as { body: unknown }),
      [`GET /workspaces/${graceWorkspace.id}`]: { body: graceWorkspace },
      [`GET /workspaces/${graceWorkspace.id}/channels`]: { body: { items: [] } },
      [`GET /workspaces/${graceWorkspace.id}/conversations`]: { body: { items: [] } },
      [`GET /workspaces/${graceWorkspace.id}/members`]: { body: { items: [] } },
      [`GET /workspaces/${graceWorkspace.id}/boards`]: { body: { items: [] } },
    })
    const { router } = renderRoute(channelPath(general.id))
    expect(await screen.findByRole('link', { name: /ada-secret-channel/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Account menu for Ada/ }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'Sign in to SyncSpace' })
    expect(fakeSocket.connected).toBe(false)

    await user.type(screen.getByLabelText('Email'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'Correct-Horse-9')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toContain(graceWorkspace.id)
    })
    expect(await screen.findByRole('heading', { name: /Grace Labs/ })).toBeInTheDocument()
    expect(screen.queryByText(/ada-secret-channel/)).not.toBeInTheDocument()
  })

  it('sends an expired session to sign-in with an explanation and the way back', async () => {
    const user = userEvent.setup()
    const routes = chatRoutes({ channels: [general, random] })
    routes[`GET ${chatBase}/channels/${random.id}/messages`] = apiError(
      'UNAUTHENTICATED',
      401,
      'Session expired',
    )
    mockApi(routes)
    const { router } = renderRoute(channelPath(general.id))
    await screen.findByRole('heading', { level: 1, name: /general/ })

    await user.click(sidebarLink(/random/))
    expect(
      await screen.findByText('Your session expired. Sign in again to continue.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe(
      channelPath(random.id),
    )
  })
})
