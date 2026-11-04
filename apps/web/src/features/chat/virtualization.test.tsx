import { type Message, SERVER_EVENTS } from '@syncspace/shared'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
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
import { serverEmit } from '@/test/fake-socket'
import { mockApi, renderRoute } from '@/test/render'

const START = Date.parse('2026-03-02T00:00:00.000Z')

/** `count` chronological messages "Message 1" … "Message N", one minute apart. */
function history(count: number): Message[] {
  return Array.from({ length: count }, (_, i) =>
    message({
      content: `Message ${String(i + 1)}`,
      createdAt: new Date(START + i * 60_000).toISOString(),
    }),
  )
}

const scroller = () => screen.getByRole('log', { name: 'Messages' })
const articles = () => within(scroller()).queryAllByRole('article')

function scrollTo(top: number) {
  const element = scroller()
  act(() => {
    element.scrollTop = top
    fireEvent.scroll(element)
  })
}

describe('virtualized timeline', () => {
  it('keeps a 1,000-message channel light: only rows near the viewport are in the DOM', async () => {
    const messages = history(1000)
    mockApi(
      chatRoutes({
        channels: [channelSummary({ lastReadAt: messages.at(-1)?.createdAt ?? null })],
        messages: { [chatIds.general]: messages },
      }),
    )
    renderRoute(channelPath(chatIds.general))

    // Opens at the newest message.
    expect(await screen.findByText('Message 1000')).toBeInTheDocument()
    expect(articles().length).toBeLessThan(40)
    expect(screen.queryByText('Message 1')).not.toBeInTheDocument()

    // Scrolling to the top renders the oldest rows instead.
    scrollTo(0)
    expect(await screen.findByText('Message 1')).toBeInTheDocument()
    expect(screen.queryByText('Message 1000')).not.toBeInTheDocument()
    expect(articles().length).toBeLessThan(40)
  })

  it('loads older pages near the top and keeps the reading position', async () => {
    const messages = history(100)
    const routes = chatRoutes({
      channels: [channelSummary({ lastReadAt: messages.at(-1)?.createdAt ?? null })],
    })
    const older = messages.slice(0, 50)
    const newest = messages.slice(50)
    routes[`GET ${chatBase}/channels/${chatIds.general}/messages`] = ({ url }) => ({
      body: url.searchParams.get('before')
        ? { items: older, nextCursor: null }
        : { items: newest, nextCursor: newest[0]?.id ?? null },
    })
    const { calls } = mockApi(routes)
    renderRoute(channelPath(chatIds.general))
    await screen.findByText('Message 100')

    scrollTo(100)
    // What the reader is looking at before older history arrives.
    expect(screen.getByText('Message 55')).toBeInTheDocument()
    // Initial page + the older page requested by scrolling near the top.
    await waitFor(() => {
      expect(
        calls.filter((call) => call.method === 'GET' && call.path.endsWith('/messages')),
      ).toHaveLength(2)
    })

    // The 50 older rows went ABOVE the viewport: the offset grew by their
    // (estimated) height and the same messages are still on screen.
    await waitFor(() => {
      expect(scroller().scrollTop).toBeGreaterThan(1000)
    })
    expect(screen.getByText('Message 55')).toBeInTheDocument()
    expect(screen.queryByText('Message 1')).not.toBeInTheDocument()
  })

  it('jumps to unread and to the newest message', async () => {
    const user = userEvent.setup()
    const messages = history(400)
    mockApi(
      chatRoutes({
        channels: [
          channelSummary({ unreadCount: 100, lastReadAt: messages[299]?.createdAt ?? null }),
        ],
        messages: { [chatIds.general]: messages },
      }),
    )
    renderRoute(channelPath(chatIds.general))

    // Opens at the unread divider, not at the bottom.
    expect(await screen.findByRole('separator', { name: 'New messages' })).toBeInTheDocument()
    expect(screen.getByText('Message 301')).toBeInTheDocument()
    expect(screen.queryByText('Message 400')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Jump to newest' }))
    expect(await screen.findByText('Message 400')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Jump to newest' })).not.toBeInTheDocument()
    })

    await user.click(await screen.findByRole('button', { name: 'Jump to unread' }))
    expect(await screen.findByRole('separator', { name: 'New messages' })).toBeInTheDocument()
  })

  it('follows new messages while at the bottom', async () => {
    const messages = history(300)
    mockApi(
      chatRoutes({
        channels: [channelSummary({ lastReadAt: messages.at(-1)?.createdAt ?? null })],
        messages: { [chatIds.general]: messages },
      }),
    )
    renderRoute(channelPath(chatIds.general))
    await screen.findByText('Message 300')

    act(() => {
      serverEmit(SERVER_EVENTS.MESSAGE_CREATED, {
        message: message({
          content: 'Fresh off the press',
          createdAt: new Date(START + 301 * 60_000).toISOString(),
        }),
        clientMessageId: null,
        parent: null,
      })
    })
    expect(await screen.findByText('Fresh off the press')).toBeInTheDocument()
    expect(articles().length).toBeLessThan(40)
  })
})
