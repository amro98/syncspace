/**
 * Database invariant tests. They need a migrated PostgreSQL database and run
 * only when TEST_DATABASE_URL is set; otherwise the whole suite is skipped.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test --workspace @syncspace/api
 *
 * Every test creates its own users/workspace with unique emails and slugs and
 * removes them afterwards, so the suite can run against a shared dev database.
 */
import { randomUUID } from 'node:crypto'

import { PrismaPg } from '@prisma/adapter-pg'
import { directConversationKey } from '@syncspace/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PrismaClient } from '@/generated/prisma/client'

const connectionString = process.env.TEST_DATABASE_URL

/** Collects the messages of an error and its causes, for matching constraint names. */
function describeError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    parts.push(current.message)
    current = current.cause
  }
  if (typeof error === 'object' && error !== null && 'meta' in error) {
    parts.push(JSON.stringify(error.meta))
  }
  return parts.join(' | ')
}

function createClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString ?? '' }) })
}

/**
 * Runs an operation that the database must reject, on its own short-lived
 * client: a failed statement can never leave shared connection state behind
 * (some proxies and the PGlite socket server also drop the connection on error).
 */
async function expectDbError(
  operation: (db: PrismaClient) => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  const db = createClient()
  try {
    const error = await operation(db).then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(
      error,
      `expected the database to reject the operation (${String(pattern)})`,
    ).not.toBeNull()
    expect(describeError(error)).toMatch(pattern)
  } finally {
    await db.$disconnect()
  }
}

describe.skipIf(!connectionString)('database invariants (PostgreSQL)', () => {
  let prisma: PrismaClient
  const createdWorkspaceIds: string[] = []
  const createdUserIds: string[] = []

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: { email: `${label}-${randomUUID()}@test.syncspace.dev`, name: label },
    })
    createdUserIds.push(user.id)
    return user
  }

  /** Workspace with an OWNER, an ADMIN and a MEMBER. */
  async function createWorkspace() {
    const [owner, admin, member] = [
      await createUser('owner'),
      await createUser('admin'),
      await createUser('member'),
    ]
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Test',
        slug: `test-${randomUUID()}`,
        ownerId: owner.id,
        members: {
          create: [
            { userId: owner.id, role: 'OWNER' },
            { userId: admin.id, role: 'ADMIN' },
            { userId: member.id, role: 'MEMBER' },
          ],
        },
      },
    })
    createdWorkspaceIds.push(workspace.id)
    const channel = await prisma.channel.create({
      data: { workspaceId: workspace.id, name: 'general', slug: 'general' },
    })
    return { workspace, owner, admin, member, channel }
  }

  async function createBoard(workspaceId: string) {
    const board = await prisma.board.create({ data: { workspaceId, name: 'Board' } })
    const column = await prisma.boardColumn.create({
      data: { boardId: board.id, name: 'Todo', position: 1024 },
    })
    const task = await prisma.task.create({
      data: { workspaceId, boardId: board.id, columnId: column.id, title: 'Task', position: 1024 },
    })
    return { board, column, task }
  }

  beforeAll(() => {
    prisma = createClient()
  })

  afterAll(async () => {
    // Workspaces first (cascade), then users (no longer referenced by authored content).
    await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } })
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    await prisma.$disconnect()
  })

  describe('workspace ownership', () => {
    it('rejects a workspace without an OWNER membership (checked at commit)', async () => {
      const user = await createUser('lonely')
      await expectDbError(
        (db) =>
          db.workspace.create({
            data: { name: 'No owner', slug: `no-owner-${randomUUID()}`, ownerId: user.id },
          }),
        /must have its owner/,
      )
    })

    it('allows at most one OWNER member', async () => {
      const { workspace, admin } = await createWorkspace()
      await expectDbError(
        (db) =>
          db.workspaceMember.update({
            where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
            data: { role: 'OWNER' },
          }),
        /workspace_members_single_owner_key/,
      )
    })

    it('refuses to remove or demote the owner without a transfer', async () => {
      const { workspace, owner } = await createWorkspace()
      const where = { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } }
      await expectDbError((db) => db.workspaceMember.delete({ where }), /must have its owner/)
      await expectDbError(
        (db) => db.workspaceMember.update({ where, data: { role: 'ADMIN' } }),
        /must have its owner/,
      )
    })

    it('transfers ownership when demote, promote and owner_id change commit together', async () => {
      const { workspace, owner, admin } = await createWorkspace()
      await prisma.$transaction(async (tx) => {
        await tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
          data: { role: 'ADMIN' },
        })
        await tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
          data: { role: 'OWNER' },
        })
        await tx.workspace.update({ where: { id: workspace.id }, data: { ownerId: admin.id } })
      })
      const updated = await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })
      expect(updated.ownerId).toBe(admin.id)
    })

    it('blocks deleting a user who still owns a workspace', async () => {
      const { owner } = await createWorkspace()
      await expectDbError(
        (db) => db.user.delete({ where: { id: owner.id } }),
        /owner_id|Foreign key/i,
      )
    })
  })

  describe('messages', () => {
    it('requires exactly one destination', async () => {
      const { workspace, member, channel } = await createWorkspace()
      const conversation = await prisma.conversation.create({
        data: { workspaceId: workspace.id, type: 'GROUP', name: 'Group' },
      })
      const base = { workspaceId: workspace.id, authorId: member.id, content: 'hi' }

      await expectDbError(
        (db) => db.message.create({ data: base }),
        /messages_destination_xor_check/,
      )
      await expectDbError(
        (db) =>
          db.message.create({
            data: { ...base, channelId: channel.id, conversationId: conversation.id },
          }),
        /messages_destination_xor_check/,
      )
    })

    it('rejects a destination from another workspace', async () => {
      const first = await createWorkspace()
      const second = await createWorkspace()
      await expectDbError(
        (db) =>
          db.message.create({
            data: {
              workspaceId: first.workspace.id,
              authorId: first.member.id,
              channelId: second.channel.id,
              content: 'cross-tenant',
            },
          }),
        /messages_channel_id_workspace_id_fkey|Foreign key/i,
      )
    })

    it('keeps threads one level deep and in the same channel', async () => {
      const { workspace, member, channel } = await createWorkspace()
      const other = await prisma.channel.create({
        data: { workspaceId: workspace.id, name: 'random', slug: 'random' },
      })
      const base = { workspaceId: workspace.id, authorId: member.id, content: 'x' }
      const root = await prisma.message.create({ data: { ...base, channelId: channel.id } })
      const reply = await prisma.message.create({
        data: { ...base, channelId: channel.id, parentMessageId: root.id },
      })

      await expectDbError(
        (db) =>
          db.message.create({
            data: { ...base, channelId: channel.id, parentMessageId: reply.id },
          }),
        /one level deep/,
      )
      await expectDbError(
        (db) =>
          db.message.create({ data: { ...base, channelId: other.id, parentMessageId: root.id } }),
        /same channel or conversation/,
      )
    })

    it('preserves authored history: a user with messages cannot be hard-deleted', async () => {
      const { workspace, member, channel } = await createWorkspace()
      await prisma.message.create({
        data: {
          workspaceId: workspace.id,
          authorId: member.id,
          channelId: channel.id,
          content: 'x',
        },
      })
      await expectDbError(
        (db) => db.user.delete({ where: { id: member.id } }),
        /author_id|Foreign key/i,
      )
    })

    it('allows one reaction per emoji per user', async () => {
      const { workspace, member, channel } = await createWorkspace()
      const message = await prisma.message.create({
        data: {
          workspaceId: workspace.id,
          authorId: member.id,
          channelId: channel.id,
          content: 'x',
        },
      })
      await prisma.messageReaction.create({
        data: { messageId: message.id, userId: member.id, emoji: '👍' },
      })
      await prisma.messageReaction.create({
        data: { messageId: message.id, userId: member.id, emoji: '🎉' },
      })
      await expectDbError(
        (db) =>
          db.messageReaction.create({
            data: { messageId: message.id, userId: member.id, emoji: '👍' },
          }),
        /Unique constraint|message_reactions_pkey/i,
      )
    })
  })

  describe('attachments', () => {
    it('belong to exactly one owner', async () => {
      const { workspace, member, channel } = await createWorkspace()
      const { task } = await createBoard(workspace.id)
      const message = await prisma.message.create({
        data: {
          workspaceId: workspace.id,
          authorId: member.id,
          channelId: channel.id,
          content: 'x',
        },
      })
      const file = {
        workspaceId: workspace.id,
        fileName: 'a.png',
        mimeType: 'image/png',
        size: 1,
        url: 'https://cdn/a.png',
      }

      await expectDbError(
        (db) => db.attachment.create({ data: file }),
        /attachments_owner_xor_check/,
      )
      await expectDbError(
        (db) => db.attachment.create({ data: { ...file, messageId: message.id, taskId: task.id } }),
        /attachments_owner_xor_check/,
      )
      await expect(
        prisma.attachment.create({ data: { ...file, taskId: task.id } }),
      ).resolves.toBeTruthy()
    })
  })

  describe('membership-scoped rows', () => {
    it('rejects assignees, channel members and participants who are not workspace members', async () => {
      const { workspace } = await createWorkspace()
      const { task } = await createBoard(workspace.id)
      const outsider = await createUser('outsider')
      const privateChannel = await prisma.channel.create({
        data: { workspaceId: workspace.id, name: 'secret', slug: 'secret', type: 'PRIVATE' },
      })

      await expectDbError(
        (db) =>
          db.taskAssignee.create({
            data: { taskId: task.id, workspaceId: workspace.id, userId: outsider.id },
          }),
        /task_assignees_workspace_id_user_id_fkey|Foreign key/i,
      )
      await expectDbError(
        (db) =>
          db.channelMember.create({
            data: { channelId: privateChannel.id, workspaceId: workspace.id, userId: outsider.id },
          }),
        /channel_members_workspace_id_user_id_fkey|Foreign key/i,
      )
    })

    it('removing a member removes their channel memberships, participation and assignments', async () => {
      const { workspace, owner, member } = await createWorkspace()
      const { task } = await createBoard(workspace.id)
      const privateChannel = await prisma.channel.create({
        data: { workspaceId: workspace.id, name: 'secret', slug: 'secret', type: 'PRIVATE' },
      })
      const dm = await prisma.conversation.create({
        data: {
          workspaceId: workspace.id,
          type: 'DIRECT',
          directKey: directConversationKey(owner.id, member.id),
        },
      })
      await prisma.channelMember.create({
        data: { channelId: privateChannel.id, workspaceId: workspace.id, userId: member.id },
      })
      await prisma.conversationParticipant.create({
        data: { conversationId: dm.id, workspaceId: workspace.id, userId: member.id },
      })
      await prisma.taskAssignee.create({
        data: { taskId: task.id, workspaceId: workspace.id, userId: member.id },
      })

      await prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: member.id } },
      })

      const [channelRows, participantRows, assigneeRows] = await Promise.all([
        prisma.channelMember.count({ where: { userId: member.id } }),
        prisma.conversationParticipant.count({ where: { userId: member.id } }),
        prisma.taskAssignee.count({ where: { userId: member.id } }),
      ])
      expect({ channelRows, participantRows, assigneeRows }).toEqual({
        channelRows: 0,
        participantRows: 0,
        assigneeRows: 0,
      })
    })
  })

  describe('boards and tasks', () => {
    it('rejects a column from another board and a board from another workspace', async () => {
      const { workspace } = await createWorkspace()
      const other = await createWorkspace()
      const first = await createBoard(workspace.id)
      const second = await createBoard(workspace.id)
      const foreign = await createBoard(other.workspace.id)
      const base = { workspaceId: workspace.id, title: 'x', position: 1 }

      await expectDbError(
        (db) =>
          db.task.create({
            data: { ...base, boardId: first.board.id, columnId: second.column.id },
          }),
        /tasks_column_id_board_id_fkey|Foreign key/i,
      )
      await expectDbError(
        (db) =>
          db.task.create({
            data: { ...base, boardId: foreign.board.id, columnId: foreign.column.id },
          }),
        /tasks_board_id_workspace_id_fkey|Foreign key/i,
      )
    })

    it('rejects labels from another workspace', async () => {
      const { workspace } = await createWorkspace()
      const other = await createWorkspace()
      const { task } = await createBoard(workspace.id)
      const foreignLabel = await prisma.taskLabel.create({
        data: { workspaceId: other.workspace.id, name: 'Bug', color: '#EF4444' },
      })
      await expectDbError(
        (db) =>
          db.taskLabelAssignment.create({
            data: { taskId: task.id, labelId: foreignLabel.id, workspaceId: workspace.id },
          }),
        /task_label_assignments_label_id_workspace_id_fkey|Foreign key/i,
      )
    })

    it('blocks deleting a column that still has tasks, but deletes whole boards', async () => {
      const { workspace } = await createWorkspace()
      const { board, column } = await createBoard(workspace.id)
      await expectDbError(
        (db) => db.boardColumn.delete({ where: { id: column.id } }),
        /tasks_column_id_board_id_fkey|Foreign key/i,
      )
      await prisma.board.delete({ where: { id: board.id } })
      expect(await prisma.task.count({ where: { boardId: board.id } })).toBe(0)
    })

    it('rejects non-finite positions and invalid label colours', async () => {
      const { workspace } = await createWorkspace()
      const { board } = await createBoard(workspace.id)
      await expectDbError(
        (db) =>
          db.boardColumn.create({
            data: { boardId: board.id, name: 'Bad', position: Number.POSITIVE_INFINITY },
          }),
        /board_columns_position_finite_check/,
      )
      await expectDbError(
        (db) =>
          db.taskLabel.create({ data: { workspaceId: workspace.id, name: 'Red', color: 'red' } }),
        /task_labels_color_check/,
      )
    })
  })

  describe('conversations', () => {
    it('prevents a second direct conversation between the same pair', async () => {
      const { workspace, owner, member } = await createWorkspace()
      const data = {
        workspaceId: workspace.id,
        type: 'DIRECT' as const,
        directKey: directConversationKey(owner.id, member.id),
      }
      await prisma.conversation.create({ data })
      await expectDbError(
        (db) =>
          db.conversation.create({
            data: { ...data, directKey: directConversationKey(member.id, owner.id) },
          }),
        /Unique constraint|conversations_workspace_id_direct_key_key/i,
      )
    })

    it('requires a direct key on DIRECT conversations only', async () => {
      const { workspace } = await createWorkspace()
      await expectDbError(
        (db) => db.conversation.create({ data: { workspaceId: workspace.id, type: 'DIRECT' } }),
        /conversations_direct_key_check/,
      )
      await expectDbError(
        (db) =>
          db.conversation.create({
            data: { workspaceId: workspace.id, type: 'GROUP', directKey: 'a:b' },
          }),
        /conversations_direct_key_check/,
      )
    })
  })

  describe('invitations and identity', () => {
    it('never invites an OWNER and keeps one pending invite per email', async () => {
      const { workspace, owner } = await createWorkspace()
      const invite = (overrides: Record<string, unknown> = {}) => ({
        workspaceId: workspace.id,
        email: 'new.person@example.com',
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdById: owner.id,
        ...overrides,
      })

      await expectDbError(
        (db) => db.workspaceInvite.create({ data: invite({ role: 'OWNER' }) }),
        /workspace_invites_role_check/,
      )
      const pending = await prisma.workspaceInvite.create({ data: invite() })
      await expectDbError(
        (db) => db.workspaceInvite.create({ data: invite() }),
        /workspace_invites_pending_email_key|Unique constraint/i,
      )
      await prisma.workspaceInvite.update({
        where: { id: pending.id },
        data: { revokedAt: new Date() },
      })
      await expect(prisma.workspaceInvite.create({ data: invite() })).resolves.toBeTruthy()
    })

    it('stores emails normalised', async () => {
      await expectDbError(
        (db) => db.user.create({ data: { email: 'Mixed@Example.com', name: 'x' } }),
        /users_email_normalized_check/,
      )
    })

    it('rejects malformed slugs', async () => {
      const user = await createUser('slug')
      await expectDbError(
        (db) =>
          db.workspace.create({
            data: {
              name: 'Bad',
              slug: 'Bad Slug',
              ownerId: user.id,
              members: { create: { userId: user.id, role: 'OWNER' } },
            },
          }),
        /workspaces_slug_format_check/,
      )
    })
  })

  describe('read state', () => {
    /** Workspace + a second channel + a GROUP conversation (owner and member participate). */
    async function createReadStateFixture() {
      const base = await createWorkspace()
      const { workspace, owner, member, channel } = base
      const otherChannel = await prisma.channel.create({
        data: { workspaceId: workspace.id, name: 'random', slug: 'random' },
      })
      const conversation = await prisma.conversation.create({
        data: { workspaceId: workspace.id, type: 'GROUP', name: 'Group' },
      })
      const otherConversation = await prisma.conversation.create({
        data: { workspaceId: workspace.id, type: 'GROUP', name: 'Other' },
      })
      await prisma.conversationParticipant.createMany({
        data: [
          { conversationId: conversation.id, workspaceId: workspace.id, userId: owner.id },
          { conversationId: conversation.id, workspaceId: workspace.id, userId: member.id },
          { conversationId: otherConversation.id, workspaceId: workspace.id, userId: member.id },
        ],
      })
      const post = (destination: { channelId: string } | { conversationId: string }) =>
        prisma.message.create({
          data: { workspaceId: workspace.id, authorId: owner.id, content: 'x', ...destination },
        })
      return {
        ...base,
        otherChannel,
        conversation,
        otherConversation,
        channelMessage: await post({ channelId: channel.id }),
        otherChannelMessage: await post({ channelId: otherChannel.id }),
        conversationMessage: await post({ conversationId: conversation.id }),
        otherConversationMessage: await post({ conversationId: otherConversation.id }),
      }
    }

    it('creates a channel cursor for a workspace member, and rejects non-members', async () => {
      const { workspace, member, channel, channelMessage } = await createReadStateFixture()
      const outsider = await createUser('outsider')

      const state = await prisma.channelReadState.create({
        data: {
          channelId: channel.id,
          workspaceId: workspace.id,
          userId: member.id,
          lastReadAt: channelMessage.createdAt,
          lastReadMessageId: channelMessage.id,
        },
      })
      expect(state.lastReadMessageId).toBe(channelMessage.id)

      await expectDbError(
        (db) =>
          db.channelReadState.create({
            data: {
              channelId: channel.id,
              workspaceId: workspace.id,
              userId: outsider.id,
              lastReadAt: new Date(),
            },
          }),
        /channel_read_states_workspace_id_user_id_fkey|Foreign key/i,
      )
    })

    it('creates a conversation cursor for a participant, and rejects non-participants', async () => {
      const { admin, member, conversation, conversationMessage } = await createReadStateFixture()

      await expect(
        prisma.conversationReadState.create({
          data: {
            conversationId: conversation.id,
            userId: member.id,
            lastReadAt: conversationMessage.createdAt,
            lastReadMessageId: conversationMessage.id,
          },
        }),
      ).resolves.toMatchObject({ lastReadMessageId: conversationMessage.id })

      // The admin is a workspace member but not a participant.
      await expectDbError(
        (db) =>
          db.conversationReadState.create({
            data: { conversationId: conversation.id, userId: admin.id, lastReadAt: new Date() },
          }),
        /conversation_read_states_conversation_id_user_id_fkey|Foreign key/i,
      )
    })

    it('rejects a channel cursor on a message from another channel or from a conversation', async () => {
      const { workspace, member, channel, otherChannelMessage, conversationMessage } =
        await createReadStateFixture()
      const cursor = (lastReadMessageId: string) => ({
        channelId: channel.id,
        workspaceId: workspace.id,
        userId: member.id,
        lastReadAt: new Date(),
        lastReadMessageId,
      })

      await expectDbError(
        (db) => db.channelReadState.create({ data: cursor(otherChannelMessage.id) }),
        /must reference a message in that channel/,
      )
      await expectDbError(
        (db) => db.channelReadState.create({ data: cursor(conversationMessage.id) }),
        /must reference a message in that channel/,
      )
    })

    it('rejects a conversation cursor on a message from another conversation or a channel', async () => {
      const { member, conversation, otherConversationMessage, channelMessage } =
        await createReadStateFixture()
      const cursor = (lastReadMessageId: string) => ({
        conversationId: conversation.id,
        userId: member.id,
        lastReadAt: new Date(),
        lastReadMessageId,
      })

      await expectDbError(
        (db) => db.conversationReadState.create({ data: cursor(otherConversationMessage.id) }),
        /must reference a message in that conversation/,
      )
      await expectDbError(
        (db) => db.conversationReadState.create({ data: cursor(channelMessage.id) }),
        /must reference a message in that conversation/,
      )
    })

    it('also checks the rule when an existing cursor is moved', async () => {
      const { workspace, member, channel, channelMessage, otherChannelMessage } =
        await createReadStateFixture()
      await prisma.channelReadState.create({
        data: {
          channelId: channel.id,
          workspaceId: workspace.id,
          userId: member.id,
          lastReadAt: channelMessage.createdAt,
          lastReadMessageId: channelMessage.id,
        },
      })
      await expectDbError(
        (db) =>
          db.channelReadState.update({
            where: { channelId_userId: { channelId: channel.id, userId: member.id } },
            data: { lastReadMessageId: otherChannelMessage.id },
          }),
        /must reference a message in that channel/,
      )
    })

    it('keeps the cursor position but clears the message pointer when that message is deleted', async () => {
      const { workspace, member, channel, channelMessage, conversation, conversationMessage } =
        await createReadStateFixture()
      await prisma.channelReadState.create({
        data: {
          channelId: channel.id,
          workspaceId: workspace.id,
          userId: member.id,
          lastReadAt: channelMessage.createdAt,
          lastReadMessageId: channelMessage.id,
        },
      })
      await prisma.conversationReadState.create({
        data: {
          conversationId: conversation.id,
          userId: member.id,
          lastReadAt: conversationMessage.createdAt,
          lastReadMessageId: conversationMessage.id,
        },
      })

      // Hard deletes (soft-deleted messages keep their row and the pointer stays valid).
      await prisma.message.delete({ where: { id: channelMessage.id } })
      await prisma.message.delete({ where: { id: conversationMessage.id } })

      const channelState = await prisma.channelReadState.findUniqueOrThrow({
        where: { channelId_userId: { channelId: channel.id, userId: member.id } },
      })
      const conversationState = await prisma.conversationReadState.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId: conversation.id, userId: member.id } },
      })
      expect(channelState).toMatchObject({
        lastReadMessageId: null,
        lastReadAt: channelMessage.createdAt,
      })
      expect(conversationState).toMatchObject({
        lastReadMessageId: null,
        lastReadAt: conversationMessage.createdAt,
      })
    })

    it('allows one cursor per user per destination', async () => {
      const { workspace, member, channel, conversation } = await createReadStateFixture()
      const channelCursor = {
        channelId: channel.id,
        workspaceId: workspace.id,
        userId: member.id,
        lastReadAt: new Date(),
      }
      const conversationCursor = {
        conversationId: conversation.id,
        userId: member.id,
        lastReadAt: new Date(),
      }
      await prisma.channelReadState.create({ data: channelCursor })
      await prisma.conversationReadState.create({ data: conversationCursor })

      await expectDbError(
        (db) => db.channelReadState.create({ data: channelCursor }),
        /Unique constraint|channel_read_states_pkey/i,
      )
      await expectDbError(
        (db) => db.conversationReadState.create({ data: conversationCursor }),
        /Unique constraint|conversation_read_states_pkey/i,
      )
    })

    it('removes cursors when the user leaves, is removed, or the destination is deleted', async () => {
      const { workspace, owner, member, channel, otherChannel, conversation } =
        await createReadStateFixture()
      const now = new Date()
      await prisma.channelReadState.createMany({
        data: [
          { channelId: channel.id, workspaceId: workspace.id, userId: member.id, lastReadAt: now },
          {
            channelId: otherChannel.id,
            workspaceId: workspace.id,
            userId: owner.id,
            lastReadAt: now,
          },
        ],
      })
      await prisma.conversationReadState.createMany({
        data: [
          { conversationId: conversation.id, userId: member.id, lastReadAt: now },
          { conversationId: conversation.id, userId: owner.id, lastReadAt: now },
        ],
      })

      // Owner leaves the conversation -> their conversation cursor goes.
      await prisma.conversationParticipant.delete({
        where: { conversationId_userId: { conversationId: conversation.id, userId: owner.id } },
      })
      // Channel deleted -> its cursors go.
      await prisma.channel.delete({ where: { id: otherChannel.id } })
      // Member removed from the workspace -> all their cursors go.
      await prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: member.id } },
      })

      const [channelCursors, conversationCursors] = await Promise.all([
        prisma.channelReadState.count({ where: { workspaceId: workspace.id } }),
        prisma.conversationReadState.count({ where: { conversationId: conversation.id } }),
      ])
      expect({ channelCursors, conversationCursors }).toEqual({
        channelCursors: 0,
        conversationCursors: 0,
      })
    })
  })
})
