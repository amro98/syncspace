import type { Attachment, Message } from '@syncspace/shared'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { linkify } from '@/lib/linkify'
import {
  ada,
  channelPath,
  chatBase,
  chatIds,
  chatRoutes,
  message,
  uuid,
} from '@/test/chat-fixtures'
import { apiError, type MockReply, mockApi, renderRoute } from '@/test/render'
import { boardPath, taskFixture, taskIds, taskRoutes } from '@/test/task-fixtures'

const png = (name = 'chart.png') =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })
const pdf = (name = 'report.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' })

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  const id = overrides.id ?? uuid(0xa77)
  return {
    id,
    fileName: 'chart.png',
    mimeType: 'image/png',
    size: 2048,
    url: `/attachments/${id}/content`,
    ...overrides,
  }
}

const fileInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('file input missing')
  return input
}

describe('message attachments', () => {
  it('attaches files, shows them uploading, then renders the confirmed attachments', async () => {
    const user = userEvent.setup()
    let release: ((reply: MockReply) => void) | undefined
    let sent: unknown
    const routes = chatRoutes()
    routes[`POST ${chatBase}/channels/${chatIds.general}/messages`] = ({ body }) => {
      sent = body
      return new Promise<MockReply>((resolve) => {
        release = resolve
      })
    }
    mockApi(routes)
    renderRoute(channelPath(chatIds.general))
    const composer = await screen.findByRole('textbox', { name: 'Message #general' })

    await user.upload(fileInput(), [png(), pdf()])
    const pending = screen.getByRole('list', { name: 'Files to send' })
    expect(within(pending).getByText('chart.png')).toBeInTheDocument()
    await user.click(within(pending).getByRole('button', { name: 'Remove report.pdf' }))
    expect(within(pending).queryByText('report.pdf')).not.toBeInTheDocument()

    await user.type(composer, 'See chart{Enter}')
    expect(sent).toEqual({
      fields: { content: 'See chart', clientMessageId: expect.any(String) as string },
      files: ['chart.png'],
    })
    // Not shown as sent while the file is uploading.
    const uploading = await screen.findByRole('list', { name: 'Uploading files' })
    expect(within(uploading).getByText('chart.png')).toBeInTheDocument()

    const confirmed: Message = message({
      author: ada,
      content: 'See chart',
      attachments: [attachment()],
    })
    await act(async () => {
      release?.({ status: 201, body: confirmed })
      await Promise.resolve()
    })
    const thumb = await screen.findByRole('button', { name: 'Open image chart.png' })
    expect(within(thumb).getByRole('presentation')).toHaveAttribute(
      'src',
      `http://localhost:4000/attachments/${uuid(0xa77)}/content`,
    )
    expect(screen.queryByRole('list', { name: 'Uploading files' })).not.toBeInTheDocument()
  })

  it('keeps the text and files when the upload fails, and retries with them', async () => {
    const user = userEvent.setup()
    const bodies: unknown[] = []
    const routes = chatRoutes()
    routes[`POST ${chatBase}/channels/${chatIds.general}/messages`] = ({ body }) => {
      bodies.push(body)
      return bodies.length === 1
        ? apiError('STORAGE_UNAVAILABLE', 503, 'Could not store the file. Please try again.')
        : {
            status: 201,
            body: message({
              author: ada,
              content: 'Report',
              attachments: [attachment({ fileName: 'report.pdf', mimeType: 'application/pdf' })],
            }),
          }
    }
    mockApi(routes)
    renderRoute(channelPath(chatIds.general))
    const composer = await screen.findByRole('textbox', { name: 'Message #general' })

    await user.upload(fileInput(), pdf())
    await user.type(composer, 'Report{Enter}')
    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('Not sent.')

    await user.click(within(failure).getByRole('button', { name: 'Retry' }))
    await waitFor(() => {
      expect(bodies).toHaveLength(2)
    })
    expect((bodies[1] as { files: string[] }).files).toEqual(['report.pdf'])
    expect(await screen.findByTitle('report.pdf')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Download report.pdf/ })).toHaveAttribute(
      'href',
      expect.stringContaining('?download=1') as string,
    )
  })

  it('checks type and size before uploading and accepts pasted images', async () => {
    // Bypass the picker's accept filter, as a drag-and-drop would.
    const user = userEvent.setup({ applyAccept: false })
    mockApi(chatRoutes())
    renderRoute(channelPath(chatIds.general))
    const composer = await screen.findByRole('textbox', { name: 'Message #general' })

    await user.upload(fileInput(), new File(['MZ'], 'tool.exe'))
    expect(await screen.findByRole('alert')).toHaveTextContent('not a supported file type')

    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' })
    await user.upload(fileInput(), big)
    expect(screen.getByRole('alert')).toHaveTextContent('larger than 10 MB')

    fireEvent.paste(composer, {
      clipboardData: { files: [new File(['x'], 'image.png', { type: 'image/png' })] },
    })
    expect(
      within(screen.getByRole('list', { name: 'Files to send' })).getByText(/^pasted-.*\.png$/),
    ).toBeInTheDocument()
  })

  it('previews images in a dialog and lets authors remove their own files', async () => {
    const user = userEvent.setup()
    const own = message({ author: ada, content: 'mine', attachments: [attachment()] })
    const theirs = message({
      content: 'theirs',
      attachments: [attachment({ id: uuid(0xa78), fileName: 'other.png' })],
    })
    const routes = chatRoutes({ messages: { [chatIds.general]: [theirs, own] } })
    routes[`DELETE /attachments/${uuid(0xa77)}`] = {
      body: { message: { ...own, attachments: [] } },
    }
    mockApi(routes)
    renderRoute(channelPath(chatIds.general))

    await user.click(await screen.findByRole('button', { name: 'Open image other.png' }))
    const dialog = screen.getByRole('dialog', { name: 'other.png' })
    expect(within(dialog).getByRole('img', { name: 'other.png' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      `http://localhost:4000/attachments/${uuid(0xa78)}/content?download=1`,
    )
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Remove other.png' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove chart.png' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove “chart.png”?' })).getByRole('button', {
        name: 'Remove file',
      }),
    )
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Open image chart.png' })).not.toBeInTheDocument()
    })
  })
})

describe('task attachments', () => {
  it('uploads and removes task files from the task panel', async () => {
    const user = userEvent.setup()
    const task = taskFixture({ title: 'Spec' })
    const file = attachment({
      id: uuid(0xa79),
      fileName: 'spec.pdf',
      mimeType: 'application/pdf',
      size: 3_200_000,
    })
    const routes = taskRoutes({ tasks: [task] })
    routes[`POST /tasks/${task.id}/attachments`] = ({ body }) => {
      expect(body).toEqual({ fields: {}, files: ['spec.pdf'] })
      return { status: 201, body: { ...task, attachments: [file] } }
    }
    routes[`DELETE /attachments/${file.id}`] = { body: { task: { ...task, attachments: [] } } }
    mockApi(routes)
    renderRoute(boardPath(taskIds.board, `?task=${task.id}`))
    const panel = await screen.findByRole('complementary', { name: 'Task details' })

    const input = panel.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('task file input missing')
    expect(within(panel).getByRole('button', { name: 'Add files' })).toBeInTheDocument()
    await user.upload(input, pdf('spec.pdf'))
    expect(await within(panel).findByTitle('spec.pdf')).toBeInTheDocument()
    expect(within(panel).getByText('PDF · 3.1 MB')).toBeInTheDocument()
    // The card on the board shows the count too.
    expect(screen.getByRole('button', { name: /Spec/ })).toHaveTextContent('1 attachment')

    await user.click(within(panel).getByRole('button', { name: 'Remove spec.pdf' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove “spec.pdf”?' })).getByRole('button', {
        name: 'Remove file',
      }),
    )
    await waitFor(() => {
      expect(within(panel).queryByTitle('spec.pdf')).not.toBeInTheDocument()
    })
  })
})

describe('linkify', () => {
  it('links only http(s) URLs and leaves everything else as text', () => {
    expect(linkify('see https://example.com/a?b=1, then javascript:alert(1)')).toEqual([
      { text: 'see ' },
      { href: 'https://example.com/a?b=1' },
      { text: ', then javascript:alert(1)' },
    ])
    expect(linkify('(http://x.dev).')).toEqual([
      { text: '(' },
      { href: 'http://x.dev' },
      { text: ').' },
    ])
  })
})
