import { LIMITS, readCursorSchema } from '@syncspace/shared'
import { describe, expect, it } from 'vitest'

import { getPrisma } from '@/lib/prisma'
import {
  chatWorkspace,
  createChannelAs,
  listChannels,
  openDm,
  postMessage,
} from '@/test/chat-fixtures'

describe('channel unread counts', () => {
  it('counts other people’s top-level, non-deleted messages after the cursor', async () => {
    const { base, general, owner, member } = await chatWorkspace()
    const path = `${base}/channels/${general.id}`
    await postMessage(member.agent, path, 'mine')
    const first = await postMessage(owner.agent, path, 'one')
    await postMessage(owner.agent, path, 'two')
    const deleted = await postMessage(owner.agent, path, 'three')
    await owner.agent.delete(`/messages/${deleted.id}`).expect(200)
    await owner.agent.post(`/messages/${first.id}/replies`).send({ content: 'reply' }).expect(201)

    const unread = (await listChannels(member.agent, base)).find((c) => c.id === general.id)
    expect(unread?.unreadCount).toBe(2)
    // Own messages never count, and posting advances the author's cursor past earlier messages.
    expect(
      (await listChannels(owner.agent, base)).find((c) => c.id === general.id)?.unreadCount,
    ).toBe(0)

    await postMessage(member.agent, path, 'caught up')
    expect(
      (await listChannels(member.agent, base)).find((c) => c.id === general.id)?.unreadCount,
    ).toBe(0)
  })

  it('marks read, never moves the cursor backwards, and rejects foreign messages', async () => {
    const { base, general, owner, member } = await chatWorkspace()
    const path = `${base}/channels/${general.id}`
    const older = await postMessage(owner.agent, path, 'older')
    const newer = await postMessage(owner.agent, path, 'newer')

    const cursor = readCursorSchema.parse(
      (await member.agent.post(`${path}/read`).send({ messageId: newer.id }).expect(200)).body,
    )
    expect(cursor.lastReadMessageId).toBe(newer.id)
    expect(
      (await listChannels(member.agent, base)).find((c) => c.id === general.id)?.unreadCount,
    ).toBe(0)

    const stale = readCursorSchema.parse(
      (await member.agent.post(`${path}/read`).send({ messageId: older.id }).expect(200)).body,
    )
    expect(stale.lastReadMessageId).toBe(newer.id)

    const elsewhere = await createChannelAs(owner.agent, base, { name: 'elsewhere' })
    const foreign = await postMessage(owner.agent, `${base}/channels/${elsewhere.id}`, 'not here')
    await member.agent.post(`${path}/read`).send({ messageId: foreign.id }).expect(400)
  })

  it('stops counting at the cap (clients show 99+)', async () => {
    const { base, general, owner, member, workspace } = await chatWorkspace()
    const start = Date.now() + 1000
    await getPrisma().message.createMany({
      data: Array.from({ length: LIMITS.UNREAD_COUNT_CAP + 20 }, (_, i) => ({
        workspaceId: workspace.id,
        channelId: general.id,
        authorId: owner.user.id,
        content: `bulk ${String(i)}`,
        createdAt: new Date(start + i),
      })),
    })
    const channel = (await listChannels(member.agent, base)).find((c) => c.id === general.id)
    expect(channel?.unreadCount).toBe(LIMITS.UNREAD_COUNT_CAP)
  })

  it('does not count history from before the viewer joined', async () => {
    const { base, general, owner, workspace } = await chatWorkspace()
    await postMessage(owner.agent, `${base}/channels/${general.id}`, 'old news')
    const { createAgent, createUser, signIn } = await import('@/test/helpers')
    const late = await createUser({ name: 'Late Joiner' })
    await getPrisma().workspaceMember.create({
      data: { workspaceId: workspace.id, userId: late.id, role: 'MEMBER' },
    })
    const agent = createAgent()
    await signIn(agent, late.email)
    expect((await listChannels(agent, base)).find((c) => c.id === general.id)?.unreadCount).toBe(0)
  })
})

describe('conversation unread counts', () => {
  it('tracks unread per participant and clears on read', async () => {
    const { base, owner, member } = await chatWorkspace()
    const dm = await openDm(owner.agent, base, member.user.id)
    const path = `${base}/conversations/${dm.id}`
    await postMessage(owner.agent, path, 'ping')
    const last = await postMessage(owner.agent, path, 'ping again')

    const list = async () =>
      (
        (await member.agent.get(`${base}/conversations`).expect(200)).body as {
          items: { id: string; unreadCount: number }[]
        }
      ).items
    expect((await list()).find((c) => c.id === dm.id)?.unreadCount).toBe(2)

    await member.agent.post(`${path}/read`).send({ messageId: last.id }).expect(200)
    expect((await list()).find((c) => c.id === dm.id)?.unreadCount).toBe(0)
  })
})
