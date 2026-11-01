import {
  apiErrorResponseSchema,
  channelListResponseSchema,
  channelMemberListResponseSchema,
} from '@syncspace/shared'
import { describe, expect, it } from 'vitest'

import { chatWorkspace, createChannelAs, listChannels, postMessage } from '@/test/chat-fixtures'

const errorCode = (body: unknown) => apiErrorResponseSchema.parse(body).error.code

describe('channel visibility', () => {
  it('shows public channels to every member and nothing to outsiders', async () => {
    const { base, member, outsider } = await chatWorkspace()
    const channels = channelListResponseSchema.parse(
      (await member.agent.get(`${base}/channels`).expect(200)).body,
    ).items
    expect(channels).toMatchObject([
      { slug: 'general', type: 'PUBLIC', isMember: true, unreadCount: 0 },
    ])

    expect(errorCode((await outsider.agent.get(`${base}/channels`).expect(404)).body)).toBe(
      'NOT_FOUND',
    )
  })

  it('hides private channels from non-members but shows them to owners/admins (oversight)', async () => {
    const { base, owner, admin, member } = await chatWorkspace()
    const secret = await createChannelAs(member.agent, base, {
      name: 'Secret Plans',
      type: 'PRIVATE',
    })
    expect(secret).toMatchObject({ slug: 'secret-plans', isMember: true, memberCount: 1 })

    const ownerView = (await listChannels(owner.agent, base)).find((c) => c.id === secret.id)
    expect(ownerView).toMatchObject({ type: 'PRIVATE', isMember: false })
    const adminView = (await listChannels(admin.agent, base)).find((c) => c.id === secret.id)
    expect(adminView?.isMember).toBe(false)

    // Admins may read (oversight) but not post without membership.
    await admin.agent.get(`${base}/channels/${secret.id}/messages`).expect(200)
    const post = await admin.agent
      .post(`${base}/channels/${secret.id}/messages`)
      .send({ content: 'hi' })
    expect(post.status).toBe(403)
  })

  it('does not leak a private channel to a regular member who is not in it', async () => {
    const { base, owner, member } = await chatWorkspace()
    const secret = await createChannelAs(owner.agent, base, { name: 'leadership', type: 'PRIVATE' })

    expect((await listChannels(member.agent, base)).map((c) => c.id)).not.toContain(secret.id)
    const read = await member.agent.get(`${base}/channels/${secret.id}/messages`).expect(404)
    expect(errorCode(read.body)).toBe('NOT_FOUND')
  })
})

describe('creating and editing channels', () => {
  it('lets any member create channels (policy) with workspace-unique slugs', async () => {
    const { base, member } = await chatWorkspace()
    const first = await createChannelAs(member.agent, base, { name: 'General' })
    expect(first.slug).toBe('general-2')
    const second = await createChannelAs(member.agent, base, {
      name: 'Design Reviews',
      description: 'Crits',
    })
    expect(second).toMatchObject({ slug: 'design-reviews', description: 'Crits', type: 'PUBLIC' })
  })

  it('validates names', async () => {
    const { base, owner } = await chatWorkspace()
    const response = await owner.agent.post(`${base}/channels`).send({ name: '   ' }).expect(400)
    expect(errorCode(response.body)).toBe('VALIDATION_ERROR')
  })

  it('lets admins rename (re-slugging safely) and members not', async () => {
    const { base, owner, admin, member } = await chatWorkspace()
    const channel = await createChannelAs(owner.agent, base, { name: 'random' })
    await createChannelAs(owner.agent, base, { name: 'watercooler' })

    const renamed = await admin.agent
      .patch(`${base}/channels/${channel.id}`)
      .send({ name: 'Watercooler', description: 'Off-topic' })
      .expect(200)
    expect(renamed.body).toMatchObject({
      name: 'Watercooler',
      slug: 'watercooler-2',
      description: 'Off-topic',
    })

    const denied = await member.agent
      .patch(`${base}/channels/${channel.id}`)
      .send({ name: 'x' })
      .expect(403)
    expect(errorCode(denied.body)).toBe('FORBIDDEN')
  })
})

describe('archiving', () => {
  it('makes a channel read-only but readable, and blocks members from archiving', async () => {
    const { base, owner, member } = await chatWorkspace()
    const channel = await createChannelAs(owner.agent, base, { name: 'launch' })
    const message = await postMessage(
      member.agent,
      `${base}/channels/${channel.id}`,
      'before archive',
    )

    await member.agent.post(`${base}/channels/${channel.id}/archive`).expect(403)
    const archived = await owner.agent.post(`${base}/channels/${channel.id}/archive`).expect(200)
    expect(archived.body.archivedAt).toEqual(expect.any(String))

    const send = await member.agent
      .post(`${base}/channels/${channel.id}/messages`)
      .send({ content: 'after' })
      .expect(403)
    expect(apiErrorResponseSchema.parse(send.body).error.message).toMatch(/archived/)
    await member.agent.post(`/messages/${message.id}/reactions`).send({ emoji: '👍' }).expect(403)
    await member.agent.patch(`/messages/${message.id}`).send({ content: 'edit' }).expect(403)

    const history = await member.agent.get(`${base}/channels/${channel.id}/messages`).expect(200)
    expect(history.body.items).toHaveLength(1)

    await owner.agent.post(`${base}/channels/${channel.id}/unarchive`).expect(200)
    await postMessage(member.agent, `${base}/channels/${channel.id}`, 'back again')
  })

  it('refuses to archive the last active public channel', async () => {
    const { base, owner, general } = await chatWorkspace()
    const response = await owner.agent.post(`${base}/channels/${general.id}/archive`).expect(409)
    expect(apiErrorResponseSchema.parse(response.body).error.message).toMatch(/last public channel/)
  })
})

describe('private channel members', () => {
  it('adds and removes members, granting and revoking access immediately', async () => {
    const { base, owner, member } = await chatWorkspace()
    const secret = await createChannelAs(owner.agent, base, { name: 'secret', type: 'PRIVATE' })
    const membersUrl = `${base}/channels/${secret.id}/members`

    const added = await owner.agent.post(membersUrl).send({ userId: member.user.id }).expect(201)
    expect(channelMemberListResponseSchema.parse(added.body).items.map((m) => m.id)).toContain(
      member.user.id,
    )
    await postMessage(member.agent, `${base}/channels/${secret.id}`, 'thanks for the invite')
    expect((await listChannels(member.agent, base)).find((c) => c.id === secret.id)?.isMember).toBe(
      true,
    )

    await owner.agent.delete(`${membersUrl}/${member.user.id}`).expect(204)
    await member.agent.get(`${base}/channels/${secret.id}/messages`).expect(404)
    expect((await listChannels(member.agent, base)).map((c) => c.id)).not.toContain(secret.id)
  })

  it('only adds workspace members, and only private channels have member lists', async () => {
    const { base, owner, outsider, general } = await chatWorkspace()
    const secret = await createChannelAs(owner.agent, base, { name: 'secret', type: 'PRIVATE' })
    await owner.agent
      .post(`${base}/channels/${secret.id}/members`)
      .send({ userId: outsider.user.id })
      .expect(400)
    await owner.agent.get(`${base}/channels/${general.id}/members`).expect(400)
  })

  it('lets members add people and leave, but not remove others', async () => {
    const { base, owner, admin, member } = await chatWorkspace()
    const secret = await createChannelAs(member.agent, base, { name: 'club', type: 'PRIVATE' })
    const membersUrl = `${base}/channels/${secret.id}/members`

    await member.agent.post(membersUrl).send({ userId: owner.user.id }).expect(201)
    await member.agent.delete(`${membersUrl}/${owner.user.id}`).expect(403)
    await admin.agent.delete(`${membersUrl}/${owner.user.id}`).expect(204)
    await member.agent.delete(`${membersUrl}/${member.user.id}`).expect(204)
    await member.agent.get(`${base}/channels/${secret.id}/messages`).expect(404)
  })
})
