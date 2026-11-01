import {
  apiErrorResponseSchema,
  messagePageSchema,
  messageSchema,
  threadResponseSchema,
} from '@syncspace/shared'
import { describe, expect, it } from 'vitest'

import { getPrisma } from '@/lib/prisma'
import { chatWorkspace, createChannelAs, openDm, postMessage } from '@/test/chat-fixtures'

const errorCode = (body: unknown) => apiErrorResponseSchema.parse(body).error.code

describe('sending and listing', () => {
  it('stores trimmed messages with the author’s public profile only', async () => {
    const { base, general, member } = await chatWorkspace()
    const message = messageSchema.parse(
      await postMessage(member.agent, `${base}/channels/${general.id}`, '  hello world  '),
    )
    expect(message).toMatchObject({
      content: 'hello world',
      destination: { kind: 'channel', id: general.id },
      author: { id: member.user.id, name: 'Mia Member', avatarUrl: null },
      reactions: [],
      replyCount: 0,
      editedAt: null,
      deletedAt: null,
    })
    expect(JSON.stringify(message)).not.toMatch(/email|passwordHash/)
  })

  it('rejects empty and oversized messages', async () => {
    const { base, general, member } = await chatWorkspace()
    const url = `${base}/channels/${general.id}/messages`
    expect(
      errorCode((await member.agent.post(url).send({ content: '   ' }).expect(400)).body),
    ).toBe('VALIDATION_ERROR')
    await member.agent
      .post(url)
      .send({ content: 'x'.repeat(10_001) })
      .expect(400)
  })

  it('paginates newest-first with a cursor, without overlaps or gaps', async () => {
    const { base, general, member } = await chatWorkspace()
    const path = `${base}/channels/${general.id}`
    for (let i = 1; i <= 7; i += 1) await postMessage(member.agent, path, `m${String(i)}`)

    const first = messagePageSchema.parse(
      (await member.agent.get(`${path}/messages?limit=3`).expect(200)).body,
    )
    expect(first.items.map((m) => m.content)).toEqual(['m5', 'm6', 'm7'])
    const second = messagePageSchema.parse(
      (
        await member.agent
          .get(`${path}/messages?limit=3&before=${first.nextCursor ?? ''}`)
          .expect(200)
      ).body,
    )
    expect(second.items.map((m) => m.content)).toEqual(['m2', 'm3', 'm4'])
    const third = messagePageSchema.parse(
      (
        await member.agent
          .get(`${path}/messages?limit=3&before=${second.nextCursor ?? ''}`)
          .expect(200)
      ).body,
    )
    expect(third.items.map((m) => m.content)).toEqual(['m1'])
    expect(third.nextCursor).toBeNull()
  })
})

describe('editing and deleting', () => {
  it('lets only the author edit, marking the message edited', async () => {
    const { base, general, owner, member } = await chatWorkspace()
    const message = await postMessage(member.agent, `${base}/channels/${general.id}`, 'typo')

    expect(
      errorCode(
        (await owner.agent.patch(`/messages/${message.id}`).send({ content: 'x' }).expect(403))
          .body,
      ),
    ).toBe('FORBIDDEN')
    const edited = messageSchema.parse(
      (await member.agent.patch(`/messages/${message.id}`).send({ content: 'fixed' }).expect(200))
        .body,
    )
    expect(edited.content).toBe('fixed')
    expect(edited.editedAt).not.toBeNull()
  })

  it('soft-deletes: the row stays in the timeline, redacted', async () => {
    const { base, general, member } = await chatWorkspace()
    const path = `${base}/channels/${general.id}`
    const message = await postMessage(member.agent, path, 'oops, secret')

    const deleted = messageSchema.parse(
      (await member.agent.delete(`/messages/${message.id}`).expect(200)).body,
    )
    expect(deleted).toMatchObject({ content: '', reactions: [], deletedAt: expect.any(String) })

    const page = messagePageSchema.parse(
      (await member.agent.get(`${path}/messages`).expect(200)).body,
    )
    expect(page.items.find((m) => m.id === message.id)).toMatchObject({
      content: '',
      deletedAt: expect.any(String),
    })
    const row = await getPrisma().message.findUniqueOrThrow({ where: { id: message.id } })
    expect(row.content).toBe('')

    await member.agent.patch(`/messages/${message.id}`).send({ content: 'undo' }).expect(403)
  })

  it('lets owners/admins moderate channel messages but not members', async () => {
    const { base, general, admin, member, owner } = await chatWorkspace()
    const path = `${base}/channels/${general.id}`
    const byMember = await postMessage(member.agent, path, 'spam')
    const byOwner = await postMessage(owner.agent, path, 'announcement')

    await member.agent.delete(`/messages/${byOwner.id}`).expect(403)
    await admin.agent.delete(`/messages/${byMember.id}`).expect(200)
  })

  it('never lets admins moderate direct messages', async () => {
    const { base, admin, member, owner } = await chatWorkspace()
    const dm = await openDm(owner.agent, base, member.user.id)
    const message = await postMessage(
      member.agent,
      `${base}/conversations/${dm.id}`,
      'private note',
    )

    // A participant owner cannot delete the other person's DM message...
    await owner.agent.delete(`/messages/${message.id}`).expect(403)
    // ...and a non-participant admin cannot even see it.
    await admin.agent.delete(`/messages/${message.id}`).expect(404)
  })
})

describe('threads', () => {
  it('replies one level deep and counts them on the parent', async () => {
    const { base, general, owner, member } = await chatWorkspace()
    const path = `${base}/channels/${general.id}`
    const parent = await postMessage(owner.agent, path, 'question?')

    const reply = await member.agent
      .post(`/messages/${parent.id}/replies`)
      .send({ content: 'answer' })
      .expect(201)
    expect(reply.body).toMatchObject({
      parentMessageId: parent.id,
      destination: { id: general.id },
    })

    const thread = threadResponseSchema.parse(
      (await owner.agent.get(`/messages/${parent.id}/replies`).expect(200)).body,
    )
    expect(thread.parent.replyCount).toBe(1)
    expect(thread.items.map((m) => m.content)).toEqual(['answer'])

    // Replies stay out of the main timeline; the parent shows the count.
    const page = messagePageSchema.parse(
      (await owner.agent.get(`${path}/messages`).expect(200)).body,
    )
    expect(page.items.map((m) => m.content)).toEqual(['question?'])
    expect(page.items[0]?.replyCount).toBe(1)

    const nested = await owner.agent
      .post(`/messages/${(reply.body as { id: string }).id}/replies`)
      .send({ content: 'nested' })
      .expect(403)
    expect(apiErrorResponseSchema.parse(nested.body).error.message).toMatch(/one level deep/)
  })
})

describe('reactions', () => {
  it('toggles per user and emoji and returns the grouped summary', async () => {
    const { base, general, owner, member } = await chatWorkspace()
    const message = await postMessage(owner.agent, `${base}/channels/${general.id}`, 'ship it')
    const url = `/messages/${message.id}/reactions`

    await member.agent.post(url).send({ emoji: '👍' }).expect(200)
    const both = await owner.agent.post(url).send({ emoji: '👍' }).expect(200)
    expect(both.body.reactions).toEqual([
      { emoji: '👍', count: 2, userIds: [member.user.id, owner.user.id] },
    ])
    await owner.agent.post(url).send({ emoji: '🎉' }).expect(200)
    const toggledOff = await member.agent.post(url).send({ emoji: '👍' }).expect(200)
    expect(toggledOff.body.reactions).toEqual([
      { emoji: '👍', count: 1, userIds: [owner.user.id] },
      { emoji: '🎉', count: 1, userIds: [owner.user.id] },
    ])
  })
})

describe('isolation', () => {
  it('keeps messages and channels of one workspace away from another', async () => {
    const a = await chatWorkspace()
    const b = await chatWorkspace()
    const secretMessage = await postMessage(
      a.member.agent,
      `${a.base}/channels/${a.general.id}`,
      'A only',
    )

    await b.member.agent.get(`/messages/${secretMessage.id}/replies`).expect(404)
    await b.member.agent
      .post(`/messages/${secretMessage.id}/reactions`)
      .send({ emoji: '👀' })
      .expect(404)
    // A channel id from workspace A under workspace B's URL is not found.
    await b.member.agent.get(`${b.base}/channels/${a.general.id}/messages`).expect(404)
  })

  it('creates private channels the outsider cannot reach', async () => {
    const { base, owner, outsider } = await chatWorkspace()
    const secret = await createChannelAs(owner.agent, base, { name: 'vault', type: 'PRIVATE' })
    await outsider.agent.get(`${base}/channels/${secret.id}/messages`).expect(404)
  })
})
