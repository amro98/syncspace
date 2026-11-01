import { SERVER_EVENTS } from '@syncspace/shared'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  ada,
  channelPath,
  channelSummary,
  chatBase,
  chatIds,
  chatRoutes,
  conversationSummary,
  dmPath,
  grace,
  member,
  message,
} from '@/test/chat-fixtures'
import { serverEmit, simulateDisconnect, simulateReconnect } from '@/test/fake-socket'
import { apiError, ids, type MockReply, mockApi, renderRoute } from '@/test/render'

import { CHANNEL_GONE_NOTICE } from './routes/ChannelPage'

const general = channelSummary()
const random = channelSummary({
  id: chatIds.random,
  name: 'random',
  slug: 'random',
  description: null,
})
const secret = channelSummary({
  id: chatIds.secret,
  name: 'secret',
  slug: 'secret',
  type: 'PRIVATE',
  memberCount: 2,
})

function composer(name = /^Message/) {
  return screen.getByRole('textbox', { name })
}

function sidebarChannel(name: RegExp) {
  return within(screen.getByRole('list', { name: 'Channels' })).getByRole('link', { name })
}

describe('chat navigation and sidebar', () => {
  it('opens the first channel from the workspace index and renders its history', async () => {
    mockApi(chatRoutes({ messages: { [general.id]: [message({ content: 'Welcome aboard' })] } }))
    const { router } = renderRoute(`/app/workspaces/${ids.workspace}`)

    expect(await screen.findByText('Welcome aboard')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(channelPath(general.id))
    expect(screen.getByRole('heading', { level: 1, name: /general/ })).toBeInTheDocument()
    expect(screen.getByRole('log', { name: 'Messages' })).toBeInTheDocument()
  })

  it('lists channels and DMs with private markers, capped unread badges and presence', async () => {
    const user = userEvent.setup()
    mockApi(
      chatRoutes({
        channels: [
          general,
          channelSummary({ ...random, unreadCount: 3 }),
          channelSummary({ ...secret, unreadCount: 100 }),
          channelSummary({
            id: '01920000-7c00-7000-8000-0000000000c9',
            name: 'old',
            slug: 'old',
            archivedAt: '2026-02-01T00:00:00.000Z',
          }),
        ],
        conversations: [conversationSummary({ unreadCount: 1 })],
      }),
    )
    const { router } = renderRoute(channelPath(general.id))

    const randomLink = await screen.findByRole('link', { name: /random/ })
    expect(within(randomLink).getByText('3')).toBeInTheDocument()
    const secretLink = sidebarChannel(/secret.*private/)
    expect(within(secretLink).getByText('99+')).toBeInTheDocument()
    expect(screen.getByText(/archived \(1\)/)).toBeInTheDocument()

    const dms = await screen.findByRole('list', { name: 'Direct messages' })
    const dmLink = within(dms).getByRole('link', { name: /Grace Hopper/ })
    expect(within(dmLink).getByText('Online')).toBeInTheDocument()
    expect(within(dmLink).getByText('1')).toBeInTheDocument()

    await user.click(randomLink)
    expect(router.state.location.pathname).toBe(channelPath(random.id))
    expect(await screen.findByRole('heading', { level: 1, name: /random/ })).toBeInTheDocument()
  })

  it('creates a private channel and opens it', async () => {
    const user = userEvent.setup()
    const created = channelSummary({
      ...secret,
      id: '01920000-7c00-7000-8000-0000000000ca',
      name: 'design',
      slug: 'design',
      memberCount: 1,
    })
    const routes = chatRoutes()
    routes[`POST ${chatBase}/channels`] = ({ body }) => {
      expect(body).toEqual({ name: 'design', type: 'PRIVATE' })
      return { status: 201, body: created }
    }
    routes[`GET ${chatBase}/channels/${created.id}/messages`] = {
      body: { items: [], nextCursor: null },
    }
    mockApi(routes)
    const { router } = renderRoute(channelPath(general.id))

    await user.click(await screen.findByRole('button', { name: 'Create channel' }))
    const dialog = screen.getByRole('dialog', { name: 'Create a channel' })
    await user.type(within(dialog).getByLabelText('Name'), 'design')
    await user.click(within(dialog).getByText('Private'))
    await user.click(within(dialog).getByRole('button', { name: 'Create channel' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(channelPath(created.id))
    })
    expect(await screen.findByText('Welcome to design')).toBeInTheDocument()
    expect(sidebarChannel(/design.*private/)).toBeInTheDocument()
  })

  it('starts a direct message from the new message dialog', async () => {
    const user = userEvent.setup()
    const dm = conversationSummary()
    const routes = chatRoutes()
    routes[`POST ${chatBase}/conversations/direct`] = ({ body }) => {
      expect(body).toEqual({ targetUserId: grace.id })
      return { status: 201, body: dm }
    }
    routes[`GET ${chatBase}/conversations/${dm.id}/messages`] = {
      body: { items: [], nextCursor: null },
    }
    mockApi(routes)
    const { router } = renderRoute(channelPath(general.id))

    await user.click(await screen.findByRole('button', { name: 'New message' }))
    const dialog = screen.getByRole('dialog', { name: 'New message' })
    await user.click(await within(dialog).findByRole('button', { name: /Grace Hopper/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Open conversation' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(dmPath(dm.id))
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Grace Hopper' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Active now')).toBeInTheDocument()
    expect(composer(/Message Grace Hopper/)).toBeInTheDocument()
  })

  it('searches messages and opens a result in its thread', async () => {
    const user = userEvent.setup()
    const found = message({ content: 'deploy is green' })
    const routes = chatRoutes()
    routes[`GET ${chatBase}/search/messages`] = ({ url }) => {
      expect(url.searchParams.get('q')).toBe('deploy')
      return {
        body: {
          items: [
            {
              messageId: found.id,
              parentMessageId: null,
              destination: { kind: 'channel', id: general.id, name: 'general' },
              author: grace,
              createdAt: found.createdAt,
              snippet: 'deploy is green',
            },
          ],
        },
      }
    }
    routes[`GET /messages/${found.id}/replies`] = {
      body: { parent: found, items: [], nextCursor: null },
    }
    mockApi(routes)
    const { router } = renderRoute(channelPath(general.id))

    await user.click(await screen.findByRole('button', { name: /Search messages/ }))
    await user.type(screen.getByRole('searchbox', { name: 'Search messages' }), 'deploy')
    const results = await screen.findByRole('list', { name: 'Search results' })
    await user.click(within(results).getByRole('button', { name: /Grace Hopper/ }))

    await waitFor(() => {
      expect(router.state.location.search).toBe(`?thread=${found.id}`)
    })
    const thread = await screen.findByRole('complementary', { name: 'Thread' })
    expect(await within(thread).findByText('deploy is green')).toBeInTheDocument()
  })
})

describe('sending and realtime updates', () => {
  it('sends optimistically, confirms once and dedupes the socket echo', async () => {
    const user = userEvent.setup()
    let release: ((reply: MockReply) => void) | undefined
    let clientMessageId = ''
    const routes = chatRoutes()
    routes[`POST ${chatBase}/channels/${general.id}/messages`] = ({ body }) => {
      clientMessageId = (body as { clientMessageId: string }).clientMessageId
      return new Promise<MockReply>((resolve) => {
        release = resolve
      })
    }
    mockApi(routes)
    renderRoute(channelPath(general.id))

    await user.type(
      await screen.findByRole('textbox', { name: 'Message #general' }),
      'Ship it{Enter}',
    )

    // Shown immediately, marked as sending; the composer is cleared.
    expect(screen.getByText('Ship it')).toBeInTheDocument()
    expect(screen.getByText('Sending…')).toBeInTheDocument()
    expect(composer()).toHaveValue('')

    const confirmed = message({
      author: ada,
      content: 'Ship it',
      createdAt: new Date().toISOString(),
    })
    // The realtime echo can arrive before the HTTP response.
    act(() => {
      serverEmit(SERVER_EVENTS.MESSAGE_CREATED, {
        message: confirmed,
        clientMessageId,
        parent: null,
      })
    })
    await act(async () => {
      release?.({ status: 201, body: confirmed })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByText('Sending…')).not.toBeInTheDocument()
    })
    expect(screen.getAllByText('Ship it')).toHaveLength(1)
  })

  it('marks a failed send and retries it', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const routes = chatRoutes()
    routes[`POST ${chatBase}/channels/${general.id}/messages`] = () => {
      attempts += 1
      return attempts === 1
        ? apiError('INTERNAL_ERROR', 500)
        : {
            status: 201,
            body: message({
              author: ada,
              content: 'Retry me',
              createdAt: new Date().toISOString(),
            }),
          }
    }
    mockApi(routes)
    renderRoute(channelPath(general.id))

    await user.type(
      await screen.findByRole('textbox', { name: 'Message #general' }),
      'Retry me{Enter}',
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Not sent.')

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => {
      expect(screen.queryByText('Not sent.')).not.toBeInTheDocument()
    })
    expect(screen.getAllByText('Retry me')).toHaveLength(1)
    expect(attempts).toBe(2)
  })

  it('appends messages from others live and counts unread in other channels', async () => {
    mockApi(chatRoutes({ channels: [general, random] }))
    renderRoute(channelPath(general.id))
    await screen.findByRole('textbox', { name: 'Message #general' })

    act(() => {
      serverEmit(SERVER_EVENTS.MESSAGE_CREATED, {
        message: message({ content: 'Live from Grace' }),
        clientMessageId: null,
        parent: null,
      })
      serverEmit(SERVER_EVENTS.MESSAGE_CREATED, {
        message: message({ content: 'Elsewhere', destination: { kind: 'channel', id: random.id } }),
        clientMessageId: null,
        parent: null,
      })
    })

    expect(await screen.findByText('Live from Grace')).toBeInTheDocument()
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument()
    expect(within(sidebarChannel(/random/)).getByText('1')).toBeInTheDocument()
  })

  it('shows who is typing', async () => {
    mockApi(chatRoutes())
    renderRoute(channelPath(general.id))
    await screen.findByRole('textbox', { name: 'Message #general' })

    act(() => {
      serverEmit(SERVER_EVENTS.TYPING_UPDATED, {
        destination: { kind: 'channel', id: general.id },
        userIds: [grace.id],
      })
    })
    expect(await screen.findByText('Grace Hopper is typing…')).toBeInTheDocument()
  })

  it('reports offline and refreshes lists after reconnecting', async () => {
    const { calls } = mockApi(chatRoutes())
    renderRoute(channelPath(general.id))
    expect(await screen.findByText('Live')).toBeInTheDocument()
    const channelFetches = () =>
      calls.filter((c) => c.method === 'GET' && c.path === `${chatBase}/channels`).length
    const before = channelFetches()

    act(() => {
      simulateDisconnect()
    })
    expect(await screen.findByText('Offline')).toBeInTheDocument()
    act(() => {
      simulateReconnect()
    })
    await waitFor(() => {
      expect(channelFetches()).toBeGreaterThan(before)
    })
  })
})

describe('message actions', () => {
  it('edits and deletes the user’s own message', async () => {
    const user = userEvent.setup()
    const own = message({ author: ada, content: 'First draft' })
    const routes = chatRoutes({ messages: { [general.id]: [own] } })
    routes[`PATCH /messages/${own.id}`] = ({ body }) => ({
      body: {
        ...own,
        content: (body as { content: string }).content,
        editedAt: '2026-03-02T10:05:00.000Z',
      },
    })
    routes[`DELETE /messages/${own.id}`] = {
      body: { ...own, content: '', deletedAt: '2026-03-02T10:06:00.000Z' },
    }
    mockApi(routes)
    renderRoute(channelPath(general.id))

    await screen.findByText('First draft')
    await user.click(screen.getByRole('button', { name: 'Edit message' }))
    const editor = screen.getByRole('textbox', { name: 'Edit message' })
    await user.clear(editor)
    await user.type(editor, 'Final words{Enter}')
    expect(await screen.findByText('Final words')).toBeInTheDocument()
    expect(screen.getByText('(edited)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete message' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete message?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Message deleted')).toBeInTheDocument()
  })

  it('offers moderation delete to admins but never edit of others’ messages', async () => {
    mockApi(chatRoutes({ messages: { [general.id]: [message({ content: 'Spam' })] } }))
    renderRoute(channelPath(general.id))

    await screen.findByText('Spam')
    expect(screen.getByRole('button', { name: 'Delete message (moderation)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit message' })).not.toBeInTheDocument()
  })

  it('toggles reactions from the picker and from the pill', async () => {
    const user = userEvent.setup()
    const target = message({ content: 'React to me' })
    const routes = chatRoutes({ messages: { [general.id]: [target] } })
    let reacted = false
    routes[`POST /messages/${target.id}/reactions`] = () => {
      reacted = !reacted
      return {
        body: {
          messageId: target.id,
          destination: target.destination,
          parentMessageId: null,
          reactions: reacted ? [{ emoji: '👍', count: 1, userIds: [ada.id] }] : [],
        },
      }
    }
    mockApi(routes)
    renderRoute(channelPath(general.id))

    await screen.findByText('React to me')
    await user.click(screen.getByRole('button', { name: 'Add reaction' }))
    await user.click(screen.getByRole('menuitem', { name: 'React with thumbs up' }))

    const pill = await screen.findByRole('button', { name: /👍 1 reaction, including yours/ })
    expect(pill).toHaveAttribute('aria-pressed', 'true')
    await user.click(pill)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /👍 1 reaction/ })).not.toBeInTheDocument()
    })
  })

  it('opens a thread, shows replies and sends a reply', async () => {
    const user = userEvent.setup()
    const parent = message({ content: 'Thread starter', replyCount: 1 })
    const reply = message({ content: 'First reply', parentMessageId: parent.id, author: ada })
    const routes = chatRoutes({ messages: { [general.id]: [parent] } })
    routes[`GET /messages/${parent.id}/replies`] = {
      body: { parent, items: [reply], nextCursor: null },
    }
    routes[`POST /messages/${parent.id}/replies`] = ({ body }) => ({
      status: 201,
      body: message({
        content: (body as { content: string }).content,
        parentMessageId: parent.id,
        author: ada,
        createdAt: '2026-03-02T11:00:00.000Z',
      }),
    })
    mockApi(routes)
    const { router } = renderRoute(channelPath(general.id))

    await user.click(await screen.findByRole('button', { name: '1 reply' }))
    expect(router.state.location.search).toBe(`?thread=${parent.id}`)
    const thread = await screen.findByRole('complementary', { name: 'Thread' })
    expect(await within(thread).findByText('First reply')).toBeInTheDocument()

    await user.type(within(thread).getByRole('textbox', { name: 'Reply…' }), 'Second reply{Enter}')
    expect(await within(thread).findByText('Second reply')).toBeInTheDocument()

    await user.click(within(thread).getByRole('button', { name: 'Close thread' }))
    expect(router.state.location.search).toBe('')
  })
})

describe('read state and access', () => {
  it('shows the new-messages divider and marks the open channel read', async () => {
    const latest = message({ content: 'Unread two', createdAt: '2026-03-02T10:02:00.000Z' })
    const { calls } = mockApi(
      chatRoutes({
        channels: [channelSummary({ unreadCount: 2, lastReadAt: '2026-03-02T09:00:00.000Z' })],
        messages: {
          [general.id]: [
            message({ content: 'Old one', createdAt: '2026-03-02T08:00:00.000Z' }),
            message({ content: 'Unread one', createdAt: '2026-03-02T10:01:00.000Z' }),
            latest,
          ],
        },
      }),
    )
    renderRoute(channelPath(general.id))

    expect(await screen.findByText('New messages')).toBeInTheDocument()
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'POST',
        path: `${chatBase}/channels/${general.id}/read`,
        body: { messageId: latest.id },
      })
    })
    // The badge is cleared; the divider stays where it was while reading.
    expect(within(sidebarChannel(/general/)).queryByText('2')).not.toBeInTheDocument()
    expect(screen.getByText('New messages')).toBeInTheDocument()
  })

  it('explains why archived channels are read-only', async () => {
    mockApi(
      chatRoutes({
        channels: [general, channelSummary({ ...random, archivedAt: '2026-02-01T00:00:00.000Z' })],
      }),
    )
    renderRoute(channelPath(random.id))

    expect(await screen.findByText(/This channel is archived/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Message/ })).not.toBeInTheDocument()
  })

  it('tells admins they can read but not post in private channels they are not in', async () => {
    mockApi(
      chatRoutes({
        role: 'ADMIN',
        channels: [general, channelSummary({ ...secret, isMember: false })],
      }),
    )
    renderRoute(channelPath(secret.id))

    expect(await screen.findByText(/as a workspace admin/)).toBeInTheDocument()
  })

  it('leaves a channel the user lost access to, with a notice', async () => {
    let visible = [general, secret]
    const routes = chatRoutes({ channels: visible })
    routes[`GET ${chatBase}/channels`] = () => ({ body: { items: visible } })
    mockApi(routes)
    const { router } = renderRoute(channelPath(secret.id))
    await screen.findByRole('heading', { level: 1, name: /secret/ })

    // The member is removed server-side; the API stops listing the channel.
    visible = [general]
    act(() => {
      serverEmit(SERVER_EVENTS.CHANNEL_REMOVED, {
        workspaceId: ids.workspace,
        channelId: secret.id,
      })
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(channelPath(general.id))
    })
    expect(await screen.findByText(CHANNEL_GONE_NOTICE)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /secret/ })).not.toBeInTheDocument()
  })

  it('redirects away from conversations that do not exist', async () => {
    mockApi(chatRoutes({ members: [member()] }))
    const { router } = renderRoute(dmPath(chatIds.dm))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(channelPath(general.id))
    })
    expect(await screen.findByText('That conversation is not available.')).toBeInTheDocument()
  })
})
