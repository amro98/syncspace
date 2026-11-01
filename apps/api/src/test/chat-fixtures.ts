import type { ChannelSummary, ConversationSummary, Message } from '@syncspace/shared'
import { expect } from 'vitest'

import { getPrisma } from '@/lib/prisma'

import { type Agent, createAgent, createUser, signIn, uniqueSlug } from './helpers'

export interface Person {
  user: Awaited<ReturnType<typeof createUser>>
  agent: Agent
}

async function person(name: string): Promise<Person> {
  const user = await createUser({ name })
  const agent = createAgent()
  await signIn(agent, user.email)
  return { user, agent }
}

/**
 * A workspace with an OWNER, an ADMIN and a MEMBER (all signed in), a public
 * #general channel, and an outsider who belongs to a different workspace.
 */
export async function chatWorkspace() {
  const [owner, admin, member, outsider] = await Promise.all([
    person('Olivia Owner'),
    person('Adam Admin'),
    person('Mia Member'),
    person('Otto Outsider'),
  ])
  const prisma = getPrisma()
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Chat Co',
      slug: uniqueSlug('chat'),
      ownerId: owner.user.id,
      members: {
        create: [
          { userId: owner.user.id, role: 'OWNER' },
          { userId: admin.user.id, role: 'ADMIN' },
          { userId: member.user.id, role: 'MEMBER' },
        ],
      },
      channels: { create: { name: 'general', slug: 'general', createdById: owner.user.id } },
    },
    include: { channels: true },
  })
  const general = workspace.channels[0]
  if (!general) throw new Error('general channel missing')

  const base = `/workspaces/${workspace.id}`
  return { workspace, general, base, owner, admin, member, outsider }
}

export type ChatWorkspace = Awaited<ReturnType<typeof chatWorkspace>>

export async function postMessage(
  agent: Agent,
  path: string,
  content: string,
  extra: Record<string, unknown> = {},
): Promise<Message> {
  const response = await agent.post(`${path}/messages`).send({ content, ...extra })
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body as Message
}

export async function createChannelAs(
  agent: Agent,
  base: string,
  input: { name: string; type?: 'PUBLIC' | 'PRIVATE'; description?: string },
): Promise<ChannelSummary> {
  const response = await agent.post(`${base}/channels`).send(input)
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body as ChannelSummary
}

export async function listChannels(agent: Agent, base: string): Promise<ChannelSummary[]> {
  const response = await agent.get(`${base}/channels`).expect(200)
  return (response.body as { items: ChannelSummary[] }).items
}

export async function openDm(agent: Agent, base: string, targetUserId: string) {
  const response = await agent.post(`${base}/conversations/direct`).send({ targetUserId })
  expect([200, 201]).toContain(response.status)
  return response.body as ConversationSummary
}
