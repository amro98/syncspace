import type { Message, Task } from '@syncspace/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getPrisma } from '@/lib/prisma'
import { setStorage } from '@/lib/storage'
import { type MemoryStorage, memoryStorage } from '@/lib/storage/memory'
import {
  type ChatWorkspace,
  chatWorkspace,
  createChannelAs,
  openDm,
  postMessage,
} from '@/test/chat-fixtures'
import type { Agent } from '@/test/helpers'
import { boardWithColumns, createTaskAs } from '@/test/task-fixtures'

import { safeFileName, validateFile } from './files'

// Minimal but genuine file signatures.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 1),
])
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF')
const TEXT = Buffer.from('name,qty\nwidget,3\n')
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0)])

let ws: ChatWorkspace
let storage: MemoryStorage

beforeEach(async () => {
  storage = memoryStorage()
  setStorage(storage)
  ws = await chatWorkspace()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function upload(
  agent: Agent,
  path: string,
  files: { name: string; body: Buffer; type?: string }[],
  fields: Record<string, string> = {},
) {
  let request = agent.post(path)
  for (const [key, value] of Object.entries(fields)) request = request.field(key, value)
  for (const file of files) {
    request = request.attach('files', file.body, {
      filename: file.name,
      contentType: file.type ?? 'application/octet-stream',
    })
  }
  return request
}

const channelPath = (w: ChatWorkspace) => `${w.base}/channels/${w.general.id}/messages`

describe('file validation', () => {
  it('identifies files by their bytes, not their name or declared type', () => {
    expect(
      validateFile({ fileName: 'chart.PNG', declaredType: 'text/html', buffer: PNG }),
    ).toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
    })
    expect(() =>
      validateFile({ fileName: 'chart.png', declaredType: 'image/png', buffer: PDF }),
    ).toThrow(/does not look like a valid PNG/)
    expect(() =>
      validateFile({ fileName: 'setup.exe', declaredType: 'image/png', buffer: EXE }),
    ).toThrow(/not a supported file type/)
    expect(() =>
      validateFile({ fileName: 'notes.txt', declaredType: 'text/plain', buffer: EXE }),
    ).toThrow(/Text file/)
  })

  it('keeps names as harmless metadata', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd')
    expect(safeFileName('C:\\Users\\me\\report.pdf')).toBe('report.pdf')
    expect(safeFileName('inv\u202Efdp.exe')).toBe('invfdp.exe')
    expect(safeFileName('...')).toBe('file')
    expect(safeFileName(`${'a'.repeat(300)}.pdf`)).toMatch(/^a{170}….pdf$/)
  })
})

describe('message attachments', () => {
  it('sends text with files and serves them only through access-checked URLs', async () => {
    const response = await upload(
      ws.member.agent,
      channelPath(ws),
      [
        { name: 'chart.png', body: PNG, type: 'image/png' },
        { name: 'Q3 report.pdf', body: PDF, type: 'application/pdf' },
      ],
      { content: 'Numbers attached' },
    ).expect(201)
    const message = response.body as Message
    expect(message.content).toBe('Numbers attached')
    expect(message.attachments).toEqual([
      expect.objectContaining({ fileName: 'chart.png', mimeType: 'image/png', size: PNG.length }),
      expect.objectContaining({ fileName: 'Q3 report.pdf', mimeType: 'application/pdf' }),
    ])
    const [image, pdf] = message.attachments
    expect(image?.url).toBe(`/attachments/${image?.id ?? ''}/content`)
    expect(storage.objects.size).toBe(2)
    for (const key of storage.objects.keys()) {
      expect(key.startsWith(`${ws.workspace.id}/`)).toBe(true)
      expect(key).not.toMatch(/chart|report/)
    }

    const served = await ws.owner.agent
      .get(image?.url ?? '')
      .buffer(true)
      .expect(200)
    expect(served.headers['content-type']).toBe('image/png')
    expect(served.headers['x-content-type-options']).toBe('nosniff')
    expect(served.headers['content-security-policy']).toContain('sandbox')
    expect(served.headers['content-disposition']).toMatch(/^inline; filename="chart.png"/)
    expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0)

    const download = await ws.owner.agent.get(`${pdf?.url ?? ''}?download=1`).expect(200)
    expect(download.headers['content-disposition']).toMatch(/^attachment; filename="Q3 report.pdf"/)
    await ws.outsider.agent.get(image?.url ?? '').expect(404)
    await ws.owner.agent
      .get('/attachments/00000000-0000-4000-8000-000000000000/content')
      .expect(404)
  })

  it('allows file-only messages but not empty ones', async () => {
    const response = await upload(ws.member.agent, channelPath(ws), [
      { name: 'data.csv', body: TEXT },
    ]).expect(201)
    expect((response.body as Message).content).toBe('')
    expect((response.body as Message).attachments[0]?.mimeType).toBe('text/csv')
    await upload(ws.member.agent, channelPath(ws), [], { content: '   ' }).expect(400)
  })

  it('rejects disallowed, spoofed, oversized and excessive files without storing anything', async () => {
    const spoofed = await upload(ws.member.agent, channelPath(ws), [
      { name: 'ok.png', body: PNG },
      { name: 'evil.png', body: Buffer.from('<script>alert(1)</script>'), type: 'image/png' },
    ])
    expect(spoofed.status).toBe(415)
    expect(spoofed.body).toMatchObject({ error: { code: 'FILE_TYPE_NOT_ALLOWED' } })

    const exe = await upload(ws.member.agent, channelPath(ws), [{ name: 'tool.exe', body: EXE }])
    expect(exe.status).toBe(415)
    const svg = await upload(ws.member.agent, channelPath(ws), [
      { name: 'logo.svg', body: Buffer.from('<svg/>') },
    ])
    expect(svg.status).toBe(415)

    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)])
    const tooLarge = await upload(ws.member.agent, channelPath(ws), [
      { name: 'huge.png', body: big },
    ])
    expect(tooLarge.status).toBe(413)
    expect(tooLarge.body).toMatchObject({ error: { code: 'FILE_TOO_LARGE' } })

    const many = Array.from({ length: 11 }, (_, i) => ({ name: `f${String(i)}.png`, body: PNG }))
    expect((await upload(ws.member.agent, channelPath(ws), many)).status).toBe(400)

    expect(storage.objects.size).toBe(0)
    expect(await getPrisma().attachment.count({ where: { workspaceId: ws.workspace.id } })).toBe(0)
  })

  it('checks permission before storing: outsiders and archived channels upload nothing', async () => {
    await upload(ws.outsider.agent, channelPath(ws), [{ name: 'a.png', body: PNG }]).expect(404)
    const archived = await createChannelAs(ws.owner.agent, ws.base, { name: 'old' })
    await createChannelAs(ws.owner.agent, ws.base, { name: 'keep' })
    await ws.owner.agent.post(`${ws.base}/channels/${archived.id}/archive`).expect(200)
    await upload(ws.member.agent, `${ws.base}/channels/${archived.id}/messages`, [
      { name: 'a.png', body: PNG },
    ]).expect(403)
    expect(storage.objects.size).toBe(0)
  })

  it('keeps private channel and DM files private', async () => {
    const secret = await createChannelAs(ws.owner.agent, ws.base, {
      name: 'secret',
      type: 'PRIVATE',
    })
    const sent = await upload(ws.owner.agent, `${ws.base}/channels/${secret.id}/messages`, [
      { name: 'plan.pdf', body: PDF },
    ]).expect(201)
    const privateUrl = (sent.body as Message).attachments[0]?.url ?? ''
    await ws.member.agent.get(privateUrl).expect(404)
    await ws.outsider.agent.get(privateUrl).expect(404)
    await ws.admin.agent.get(privateUrl).expect(200) // admin oversight of private channels

    const dm = await openDm(ws.member.agent, ws.base, ws.owner.user.id)
    const dmSent = await upload(ws.member.agent, `${ws.base}/conversations/${dm.id}/messages`, [
      { name: 'note.txt', body: TEXT },
    ]).expect(201)
    const dmUrl = (dmSent.body as Message).attachments[0]?.url ?? ''
    await ws.owner.agent.get(dmUrl).expect(200)
    await ws.admin.agent.get(dmUrl).expect(404) // admins never see DMs
    await ws.outsider.agent.get(dmUrl).expect(404)
  })

  it('removes files with their message, or one by one by the author', async () => {
    const message = (
      await upload(
        ws.member.agent,
        channelPath(ws),
        [
          { name: 'a.png', body: PNG },
          { name: 'b.pdf', body: PDF },
        ],
        { content: 'two files' },
      ).expect(201)
    ).body as Message
    const [first, second] = message.attachments

    await ws.admin.agent.delete(`/attachments/${first?.id ?? ''}`).expect(403)
    const updated = await ws.member.agent.delete(`/attachments/${first?.id ?? ''}`).expect(200)
    expect((updated.body as { message: Message }).message.attachments.map((a) => a.id)).toEqual([
      second?.id,
    ])
    expect(storage.objects.size).toBe(1)
    await ws.member.agent.get(first?.url ?? '').expect(404)

    await ws.member.agent.delete(`/messages/${message.id}`).expect(200)
    expect(storage.objects.size).toBe(0)
    await ws.member.agent.get(second?.url ?? '').expect(404)

    // A file-only message disappears with its last file.
    const fileOnly = (
      await upload(ws.member.agent, channelPath(ws), [{ name: 'c.png', body: PNG }]).expect(201)
    ).body as Message
    const removed = await ws.member.agent
      .delete(`/attachments/${fileOnly.attachments[0]?.id ?? ''}`)
      .expect(200)
    expect((removed.body as { message: Message }).message.deletedAt).not.toBeNull()
  })

  it('cleans up stored objects when storage or the database fails', async () => {
    storage.failNext('put', 1)
    const storageDown = await upload(ws.member.agent, channelPath(ws), [
      { name: 'a.png', body: PNG },
    ])
    expect(storageDown.status).toBe(503)
    expect(storageDown.body).toMatchObject({ error: { code: 'STORAGE_UNAVAILABLE' } })

    // Second file fails after the first was stored: the first is removed again.
    const realPut = storage.put.bind(storage)
    let calls = 0
    vi.spyOn(storage, 'put').mockImplementation((key, body, type) => {
      calls += 1
      return calls === 2 ? Promise.reject(new Error('disk full')) : realPut(key, body, type)
    })
    await upload(ws.member.agent, channelPath(ws), [
      { name: 'a.png', body: PNG },
      { name: 'b.png', body: PNG },
    ]).expect(503)
    expect(storage.objects.size).toBe(0)
    vi.restoreAllMocks()

    // Files stored, then the transaction fails: no objects or rows remain.
    vi.spyOn(getPrisma(), '$transaction').mockRejectedValueOnce(new Error('database unavailable'))
    const dbDown = await upload(ws.member.agent, channelPath(ws), [{ name: 'a.png', body: PNG }], {
      content: 'hi',
    })
    expect(dbDown.status).toBe(500)
    expect(storage.objects.size).toBe(0)
    expect(await getPrisma().message.count({ where: { channelId: ws.general.id } })).toBe(0)
  })

  it('reports disabled uploads clearly while text messages keep working', async () => {
    setStorage(null)
    const disabled = await upload(ws.member.agent, channelPath(ws), [{ name: 'a.png', body: PNG }])
    expect(disabled.status).toBe(503)
    expect(disabled.body).toMatchObject({ error: { code: 'STORAGE_UNAVAILABLE' } })
    await postMessage(ws.member.agent, `${ws.base}/channels/${ws.general.id}`, 'still here')
  })

  it('accepts files on thread replies', async () => {
    const parent = await postMessage(
      ws.owner.agent,
      `${ws.base}/channels/${ws.general.id}`,
      'parent',
    )
    const reply = await upload(
      ws.member.agent,
      `/messages/${parent.id}/replies`,
      [{ name: 'r.png', body: PNG }],
      {
        content: 'see image',
      },
    ).expect(201)
    expect((reply.body as Message).attachments).toHaveLength(1)
  })
})

describe('task attachments', () => {
  it('uploads, serves, lists and removes task files for workspace members only', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const task = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'Spec' })

    const added = await upload(ws.member.agent, `/tasks/${task.id}/attachments`, [
      { name: 'spec.pdf', body: PDF },
      { name: 'mock.png', body: PNG },
    ]).expect(201)
    const files = (added.body as Task).attachments
    expect(files.map((f) => f.fileName)).toEqual(['spec.pdf', 'mock.png'])

    await ws.admin.agent.get(files[0]?.url ?? '').expect(200)
    await ws.outsider.agent.get(files[0]?.url ?? '').expect(404)
    await upload(ws.outsider.agent, `/tasks/${task.id}/attachments`, [
      { name: 'x.png', body: PNG },
    ]).expect(404)
    await ws.outsider.agent.delete(`/attachments/${files[0]?.id ?? ''}`).expect(404)

    const removed = await ws.admin.agent.delete(`/attachments/${files[0]?.id ?? ''}`).expect(200)
    expect((removed.body as { task: Task }).task.attachments.map((f) => f.fileName)).toEqual([
      'mock.png',
    ])
    expect(storage.objects.size).toBe(1)

    await ws.member.agent.post(`/tasks/${task.id}/attachments`).send({}).expect(400)
    await ws.owner.agent.post(`${ws.base}/boards/${board.id}/archive`).expect(200)
    await upload(ws.member.agent, `/tasks/${task.id}/attachments`, [
      { name: 'late.png', body: PNG },
    ]).expect(403)
    expect(storage.objects.size).toBe(1)
  })

  it('still deletes the row when the object cannot be removed (logged for cleanup)', async () => {
    const { board, todo } = await boardWithColumns(ws.owner.agent, ws.base)
    const task = await createTaskAs(ws.owner.agent, board.id, { columnId: todo.id, title: 'T' })
    const added = await upload(ws.member.agent, `/tasks/${task.id}/attachments`, [
      { name: 'a.png', body: PNG },
    ]).expect(201)
    storage.failNext('delete', 3)
    await ws.member.agent
      .delete(`/attachments/${(added.body as Task).attachments[0]?.id ?? ''}`)
      .expect(200)
    expect(await getPrisma().attachment.count({ where: { taskId: task.id } })).toBe(0)
  })
})
