import {
  acceptInviteResponseSchema,
  apiErrorResponseSchema,
  invitePreviewSchema,
  workspaceDetailSchema,
  workspaceInviteSchema,
  workspaceListResponseSchema,
} from '@syncspace/shared'
import { afterEach, describe, expect, it } from 'vitest'

import { sha256 } from '@/lib/crypto'
import { outbox } from '@/lib/mail/outbox'
import { getPrisma } from '@/lib/prisma'
import {
  type Agent,
  createAgent,
  createUser,
  signIn,
  tokenFromMail,
  uniqueEmail,
  uniqueSlug,
  waitForMail,
} from '@/test/helpers'

const errorCode = (body: unknown) => apiErrorResponseSchema.parse(body).error.code

afterEach(() => {
  outbox.clear()
})

async function signedInUser(email?: string) {
  const user = await createUser(email ? { email } : {})
  const agent = createAgent()
  await signIn(agent, user.email)
  return { user, agent }
}

async function createWorkspaceAs(agent: Agent, name = 'Acme Inc.') {
  const response = await agent
    .post('/workspaces')
    .send({ name, slug: uniqueSlug('acme') })
    .expect(201)
  return workspaceDetailSchema.parse(response.body)
}

async function inviteToken(agent: Agent, workspaceId: string, email: string, role = 'MEMBER') {
  await agent.post(`/workspaces/${workspaceId}/invites`).send({ email, role }).expect(201)
  return tokenFromMail(await waitForMail(email, /invited you/), /\/invite\/([A-Za-z0-9_%-]+)/)
}

/** Owner, plus an ADMIN and a MEMBER who joined through real invitations. */
async function workspaceWithTeam() {
  const owner = await signedInUser()
  const workspace = await createWorkspaceAs(owner.agent)
  const admin = await signedInUser()
  const member = await signedInUser()
  for (const [person, role] of [
    [admin, 'ADMIN'],
    [member, 'MEMBER'],
  ] as const) {
    const token = await inviteToken(owner.agent, workspace.id, person.user.email, role)
    await person.agent.post('/invites/accept').send({ token }).expect(200)
  }
  return { owner, admin, member, workspace }
}

describe('creating workspaces', () => {
  it('makes the creator OWNER, satisfies the owner invariant and creates #general', async () => {
    const { user, agent } = await signedInUser()
    const workspace = await createWorkspaceAs(agent, 'Rocket Team')

    expect(workspace).toMatchObject({
      name: 'Rocket Team',
      ownerId: user.id,
      memberCount: 1,
      membership: { role: 'OWNER' },
    })
    const prisma = getPrisma()
    const owners = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id, role: 'OWNER' },
    })
    expect(owners.map((m) => m.userId)).toEqual([user.id])
    const channels = await prisma.channel.findMany({ where: { workspaceId: workspace.id } })
    expect(channels).toMatchObject([{ slug: 'general', type: 'PUBLIC' }])
  })

  it('rejects a taken slug with SLUG_TAKEN', async () => {
    const { agent } = await signedInUser()
    const slug = uniqueSlug('taken')
    await agent.post('/workspaces').send({ name: 'One', slug }).expect(201)
    const response = await agent.post('/workspaces').send({ name: 'Two', slug }).expect(409)
    expect(errorCode(response.body)).toBe('SLUG_TAKEN')
  })

  it('validates slugs and requires authentication', async () => {
    const { agent } = await signedInUser()
    await agent.post('/workspaces').send({ name: 'Bad', slug: 'Not A Slug' }).expect(400)
    await createAgent().post('/workspaces').send({ name: 'x', slug: 'xx' }).expect(401)
  })
})

describe('listing and opening workspaces', () => {
  it('lists only the workspaces the user belongs to, with role and member count', async () => {
    const { owner, member, workspace } = await workspaceWithTeam()
    const other = await signedInUser()
    await createWorkspaceAs(other.agent, 'Not Yours')

    const list = workspaceListResponseSchema.parse(
      (await member.agent.get('/workspaces').expect(200)).body,
    )
    expect(list.items).toEqual([
      {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: 'MEMBER',
        memberCount: 3,
      },
    ])

    const ownerList = workspaceListResponseSchema.parse(
      (await owner.agent.get('/workspaces').expect(200)).body,
    )
    expect(ownerList.items.map((w) => w.role)).toEqual(['OWNER'])
  })

  it('returns the workspace bootstrap to members and 404 to everyone else', async () => {
    const { member, workspace } = await workspaceWithTeam()
    const detail = workspaceDetailSchema.parse(
      (await member.agent.get(`/workspaces/${workspace.id}`).expect(200)).body,
    )
    expect(detail.membership.role).toBe('MEMBER')

    const outsider = await signedInUser()
    const blocked = await outsider.agent.get(`/workspaces/${workspace.id}`).expect(404)
    expect(errorCode(blocked.body)).toBe('NOT_FOUND')
    await outsider.agent
      .post(`/workspaces/${workspace.id}/invites`)
      .send({ email: uniqueEmail(), role: 'MEMBER' })
      .expect(404)
  })
})

describe('invitations', () => {
  it('lets the OWNER invite MEMBERs and ADMINs, storing only the token hash', async () => {
    const { agent } = await signedInUser()
    const workspace = await createWorkspaceAs(agent)
    const email = uniqueEmail('invitee')

    const response = await agent
      .post(`/workspaces/${workspace.id}/invites`)
      .send({ email: email.toUpperCase(), role: 'ADMIN' })
      .expect(201)
    const invite = workspaceInviteSchema.parse(response.body)
    expect(invite).toMatchObject({ email, role: 'ADMIN' })
    expect(JSON.stringify(response.body)).not.toMatch(/token/i)

    const mail = await waitForMail(email, /invited you to Acme Inc\./)
    expect(mail.text).toMatch(/as an admin/)
    const token = tokenFromMail(mail, /\/invite\/([A-Za-z0-9_%-]+)/)
    const stored = await getPrisma().workspaceInvite.findUniqueOrThrow({ where: { id: invite.id } })
    expect(stored.tokenHash).toBe(sha256(token))
  })

  it('follows the central policy: ADMIN may invite MEMBERs only, MEMBERs may not invite', async () => {
    const { admin, member, workspace } = await workspaceWithTeam()
    const url = `/workspaces/${workspace.id}/invites`

    await admin.agent.post(url).send({ email: uniqueEmail(), role: 'MEMBER' }).expect(201)
    const adminInvitesAdmin = await admin.agent
      .post(url)
      .send({ email: uniqueEmail(), role: 'ADMIN' })
      .expect(403)
    expect(errorCode(adminInvitesAdmin.body)).toBe('FORBIDDEN')

    const memberInvites = await member.agent
      .post(url)
      .send({ email: uniqueEmail(), role: 'MEMBER' })
      .expect(403)
    expect(errorCode(memberInvites.body)).toBe('FORBIDDEN')
  })

  it('never invites as OWNER', async () => {
    const { owner, workspace } = await workspaceWithTeam()
    const response = await owner.agent
      .post(`/workspaces/${workspace.id}/invites`)
      .send({ email: uniqueEmail(), role: 'OWNER' })
      .expect(400)
    expect(errorCode(response.body)).toBe('VALIDATION_ERROR')
  })

  it('rejects inviting someone who is already a member', async () => {
    const { owner, member, workspace } = await workspaceWithTeam()
    const response = await owner.agent
      .post(`/workspaces/${workspace.id}/invites`)
      .send({ email: member.user.email, role: 'MEMBER' })
      .expect(409)
    expect(errorCode(response.body)).toBe('ALREADY_MEMBER')
  })

  it('previews and accepts an invite, adding the member with the invited role (idempotently)', async () => {
    const { agent: ownerAgent } = await signedInUser()
    const workspace = await createWorkspaceAs(ownerAgent)
    const invitee = await signedInUser()
    const token = await inviteToken(ownerAgent, workspace.id, invitee.user.email, 'ADMIN')

    // Preview works signed out.
    const preview = invitePreviewSchema.parse(
      (await createAgent().post('/invites/preview').send({ token }).expect(200)).body,
    )
    expect(preview).toMatchObject({
      workspace: { id: workspace.id, name: 'Acme Inc.' },
      inviterName: 'Test User',
      role: 'ADMIN',
      email: invitee.user.email,
      status: 'PENDING',
    })

    // Accepting requires a session.
    await createAgent().post('/invites/accept').send({ token }).expect(401)

    const accepted = acceptInviteResponseSchema.parse(
      (await invitee.agent.post('/invites/accept').send({ token }).expect(200)).body,
    )
    expect(accepted.workspaceId).toBe(workspace.id)
    const again = await invitee.agent.post('/invites/accept').send({ token }).expect(200)
    expect(again.body).toEqual(accepted)

    const membership = await getPrisma().workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: invitee.user.id } },
    })
    expect(membership.role).toBe('ADMIN')
    const status = invitePreviewSchema.parse(
      (await createAgent().post('/invites/preview').send({ token }).expect(200)).body,
    ).status
    expect(status).toBe('ACCEPTED')
  })

  it('rejects an invite accepted by a different account', async () => {
    const { agent: ownerAgent } = await signedInUser()
    const workspace = await createWorkspaceAs(ownerAgent)
    const token = await inviteToken(ownerAgent, workspace.id, uniqueEmail('intended'))
    const someoneElse = await signedInUser()

    const response = await someoneElse.agent.post('/invites/accept').send({ token }).expect(403)
    expect(errorCode(response.body)).toBe('INVITE_EMAIL_MISMATCH')
  })

  it('rejects expired and unknown invites', async () => {
    const { agent: ownerAgent } = await signedInUser()
    const workspace = await createWorkspaceAs(ownerAgent)
    const invitee = await signedInUser()
    const token = await inviteToken(ownerAgent, workspace.id, invitee.user.email)
    await getPrisma().workspaceInvite.updateMany({
      where: { tokenHash: sha256(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const expired = await invitee.agent.post('/invites/accept').send({ token }).expect(410)
    expect(errorCode(expired.body)).toBe('INVITE_EXPIRED')

    const unknown = await createAgent()
      .post('/invites/preview')
      .send({ token: 'z'.repeat(43) })
      .expect(404)
    expect(errorCode(unknown.body)).toBe('INVITE_INVALID')
  })

  it('re-inviting refreshes the pending invite instead of duplicating it', async () => {
    const { agent } = await signedInUser()
    const workspace = await createWorkspaceAs(agent)
    const email = uniqueEmail('twice')
    const first = await inviteToken(agent, workspace.id, email)
    outbox.clear()
    const second = await inviteToken(agent, workspace.id, email)

    expect(second).not.toBe(first)
    expect(
      await getPrisma().workspaceInvite.count({ where: { workspaceId: workspace.id, email } }),
    ).toBe(1)
    await createAgent().post('/invites/preview').send({ token: first }).expect(404)
  })
})
