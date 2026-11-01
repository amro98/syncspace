import {
  conversationListResponseSchema,
  searchResultsResponseSchema,
  workspaceMemberListResponseSchema,
} from '@syncspace/shared'
import { describe, expect, it } from 'vitest'

import { chatWorkspace, createChannelAs, openDm, postMessage } from '@/test/chat-fixtures'

describe('direct conversations', () => {
  it('returns the same DM regardless of who opens it or how often', async () => {
    const { base, owner, member } = await chatWorkspace()
    const created = await owner.agent
      .post(`${base}/conversations/direct`)
      .send({ targetUserId: member.user.id })
      .expect(201)
    const again = await owner.agent
      .post(`${base}/conversations/direct`)
      .send({ targetUserId: member.user.id })
      .expect(200)
    const reverse = await openDm(member.agent, base, owner.user.id)

    expect(again.body.id).toBe(created.body.id)
    expect(reverse.id).toBe(created.body.id)
    expect(created.body).toMatchObject({ type: 'DIRECT', name: null })
    expect(
      (created.body as { participants: { id: string }[] }).participants.map((p) => p.id).sort(),
    ).toEqual([owner.user.id, member.user.id].sort())
  })

  it('only opens DMs with workspace members and hides them from everyone else', async () => {
    const { base, owner, admin, member, outsider } = await chatWorkspace()
    await owner.agent
      .post(`${base}/conversations/direct`)
      .send({ targetUserId: outsider.user.id })
      .expect(400)

    const dm = await openDm(owner.agent, base, member.user.id)
    await postMessage(owner.agent, `${base}/conversations/${dm.id}`, 'just us')
    await admin.agent.get(`${base}/conversations/${dm.id}/messages`).expect(404)
    const adminList = conversationListResponseSchema.parse(
      (await admin.agent.get(`${base}/conversations`).expect(200)).body,
    )
    expect(adminList.items).toHaveLength(0)
  })
})

describe('group conversations', () => {
  it('creates a group with the creator and at least two others', async () => {
    const { base, owner, admin, member } = await chatWorkspace()
    await owner.agent
      .post(`${base}/conversations/group`)
      .send({ participantIds: [member.user.id] })
      .expect(400)

    const group = await owner.agent
      .post(`${base}/conversations/group`)
      .send({ name: 'Launch crew', participantIds: [member.user.id, admin.user.id] })
      .expect(201)
    expect(group.body).toMatchObject({ type: 'GROUP', name: 'Launch crew' })
    expect((group.body as { participants: unknown[] }).participants).toHaveLength(3)

    await postMessage(member.agent, `${base}/conversations/${group.body.id as string}`, 'hi team')
    const memberList = conversationListResponseSchema.parse(
      (await member.agent.get(`${base}/conversations`).expect(200)).body,
    )
    expect(memberList.items[0]).toMatchObject({ id: group.body.id, unreadCount: 0 })
  })

  it('rejects non-members as participants', async () => {
    const { base, owner, member, outsider } = await chatWorkspace()
    await owner.agent
      .post(`${base}/conversations/group`)
      .send({ participantIds: [member.user.id, outsider.user.id] })
      .expect(400)
  })
})

describe('member directory', () => {
  it('lists members with role and presence, filtered by name or email', async () => {
    const { base, member } = await chatWorkspace()
    const all = workspaceMemberListResponseSchema.parse(
      (await member.agent.get(`${base}/members`).expect(200)).body,
    )
    expect(all.items.map((m) => m.role).sort()).toEqual(['ADMIN', 'MEMBER', 'OWNER'])
    expect(all.items[0]).toMatchObject({ online: false })
    expect(JSON.stringify(all)).not.toMatch(/passwordHash|tokenVersion/)

    const filtered = workspaceMemberListResponseSchema.parse(
      (await member.agent.get(`${base}/members?q=adam`).expect(200)).body,
    )
    expect(filtered.items.map((m) => m.name)).toEqual(['Adam Admin'])
  })
})

describe('message search', () => {
  it('finds only messages the viewer can read', async () => {
    const { base, general, owner, admin, member } = await chatWorkspace()
    const secret = await createChannelAs(owner.agent, base, { name: 'board', type: 'PRIVATE' })
    const dm = await openDm(owner.agent, base, admin.user.id)

    await postMessage(owner.agent, `${base}/channels/${general.id}`, 'Quarterly roadmap is out')
    await postMessage(owner.agent, `${base}/channels/${secret.id}`, 'Roadmap salaries draft')
    await postMessage(owner.agent, `${base}/conversations/${dm.id}`, 'roadmap gossip')

    const search = async (agent: typeof member.agent) =>
      searchResultsResponseSchema
        .parse((await agent.get(`${base}/search/messages?q=ROADMAP`).expect(200)).body)
        .items.map((item) => item.destination.name)

    expect(await search(member.agent)).toEqual(['general'])
    expect((await search(admin.agent)).sort()).toEqual(['Olivia Owner', 'board', 'general'].sort())

    const [first] = searchResultsResponseSchema.parse(
      (await member.agent.get(`${base}/search/messages?q=quarterly`).expect(200)).body,
    ).items
    expect(first).toMatchObject({
      snippet: 'Quarterly roadmap is out',
      author: { name: 'Olivia Owner' },
    })
  })

  it('treats LIKE wildcards literally', async () => {
    const { base, general, member } = await chatWorkspace()
    await postMessage(member.agent, `${base}/channels/${general.id}`, 'discount 100% off')
    await postMessage(member.agent, `${base}/channels/${general.id}`, 'nothing to see')
    const results = searchResultsResponseSchema.parse(
      (await member.agent.get(`${base}/search/messages?q=${encodeURIComponent('0%')}`).expect(200))
        .body,
    ).items
    expect(results.map((r) => r.snippet)).toEqual(['discount 100% off'])
  })
})
