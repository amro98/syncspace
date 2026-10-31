/**
 * Development seed. Small, readable demo data:
 *
 *   users        Alex Rivera (OWNER), Sam Chen (MEMBER)
 *   workspace    Acme Inc. (slug "acme")
 *   channels     #general (public), #leadership (private, Alex only)
 *   conversation Alex <-> Sam direct messages
 *   board        Product Launch: Todo / In Progress / Done, with three tasks
 *   read state   Alex has one unread DM from Sam
 *
 * Both users can sign in with the DEVELOPMENT-ONLY password below.
 *
 * Idempotent: users are upserted and the "acme" workspace is deleted (cascade)
 * and recreated on every run. Refuses to run when NODE_ENV=production.
 *
 *   npm run db:seed
 */
import { directConversationKey, evenlySpacedPositions } from '@syncspace/shared'

import { env } from '@/config/env'
import { hashPassword } from '@/lib/password'
import { disconnectPrisma, getPrisma } from '@/lib/prisma'

const WORKSPACE_SLUG = 'acme'

/** Development-only credentials for the seeded users (documented in README). */
const SEED_PASSWORD = 'SyncSpace-dev-1'

async function main(): Promise<void> {
  if (env.isProduction) {
    throw new Error('Refusing to seed: NODE_ENV is "production". The seed is for development only.')
  }

  const prisma = getPrisma()

  // Sequential on purpose: seeds favour simplicity and work on single-connection databases.
  const passwordHash = await hashPassword(SEED_PASSWORD)
  const alex = await prisma.user.upsert({
    where: { email: 'alex@example.com' },
    update: { passwordHash },
    create: { email: 'alex@example.com', name: 'Alex Rivera', passwordHash },
  })
  const sam = await prisma.user.upsert({
    where: { email: 'sam@example.com' },
    update: { passwordHash },
    create: { email: 'sam@example.com', name: 'Sam Chen', passwordHash },
  })

  await prisma.$transaction(async (tx) => {
    // Start from a clean demo workspace (cascades to everything it owns).
    await tx.workspace.deleteMany({ where: { slug: WORKSPACE_SLUG } })

    // The workspace and its OWNER membership are created together: the database
    // verifies at commit that owner_id is the workspace's single OWNER member.
    const workspace = await tx.workspace.create({
      data: {
        name: 'Acme Inc.',
        slug: WORKSPACE_SLUG,
        ownerId: alex.id,
        members: {
          create: [
            { userId: alex.id, role: 'OWNER' },
            { userId: sam.id, role: 'MEMBER' },
          ],
        },
      },
    })
    const workspaceId = workspace.id

    // --- Channels --------------------------------------------------------------
    const general = await tx.channel.create({
      data: {
        workspaceId,
        name: 'general',
        slug: 'general',
        description: 'Company-wide announcements and chat',
        type: 'PUBLIC',
        createdById: alex.id,
      },
    })
    const leadership = await tx.channel.create({
      data: {
        workspaceId,
        name: 'leadership',
        slug: 'leadership',
        description: 'Private planning channel',
        type: 'PRIVATE',
        createdById: alex.id,
      },
    })
    await tx.channelMember.create({
      data: { channelId: leadership.id, workspaceId, userId: alex.id },
    })

    // --- Direct conversation ---------------------------------------------------
    const dm = await tx.conversation.create({
      data: {
        workspaceId,
        type: 'DIRECT',
        directKey: directConversationKey(alex.id, sam.id),
        createdById: sam.id,
      },
    })
    await tx.conversationParticipant.createMany({
      data: [
        { conversationId: dm.id, workspaceId, userId: alex.id },
        { conversationId: dm.id, workspaceId, userId: sam.id },
      ],
    })

    // --- Messages --------------------------------------------------------------
    const welcome = await tx.message.create({
      data: {
        workspaceId,
        channelId: general.id,
        authorId: alex.id,
        content: 'Welcome to SyncSpace, everyone! 👋',
      },
    })
    await tx.message.create({
      data: {
        workspaceId,
        channelId: general.id,
        authorId: sam.id,
        parentMessageId: welcome.id,
        content: 'Thanks Alex — excited to get started.',
      },
    })
    await tx.messageReaction.create({
      data: { messageId: welcome.id, userId: sam.id, emoji: '🎉' },
    })
    const planning = await tx.message.create({
      data: {
        workspaceId,
        channelId: leadership.id,
        authorId: alex.id,
        content: 'Q3 planning notes go here.',
      },
    })
    const dmMessage = await tx.message.create({
      data: {
        workspaceId,
        conversationId: dm.id,
        authorId: sam.id,
        content: 'Hey Alex, do you have a minute to review the launch board?',
      },
    })

    // --- Read state ------------------------------------------------------------
    // Sam has read #general and his own DM; Alex has read #leadership but not Sam's DM,
    // so Alex starts with one unread conversation.
    await tx.channelReadState.create({
      data: {
        channelId: general.id,
        workspaceId,
        userId: sam.id,
        lastReadAt: welcome.createdAt,
        lastReadMessageId: welcome.id,
      },
    })
    await tx.channelReadState.create({
      data: {
        channelId: leadership.id,
        workspaceId,
        userId: alex.id,
        lastReadAt: planning.createdAt,
        lastReadMessageId: planning.id,
      },
    })
    await tx.conversationReadState.create({
      data: {
        conversationId: dm.id,
        userId: sam.id,
        lastReadAt: dmMessage.createdAt,
        lastReadMessageId: dmMessage.id,
      },
    })

    // --- Board -----------------------------------------------------------------
    const board = await tx.board.create({
      data: {
        workspaceId,
        name: 'Product Launch',
        description: 'Everything needed for the v1 launch',
        createdById: alex.id,
      },
    })

    const [todoPosition = 0, inProgressPosition = 0, donePosition = 0] = evenlySpacedPositions(3)
    const todo = await tx.boardColumn.create({
      data: { boardId: board.id, name: 'Todo', position: todoPosition },
    })
    const inProgress = await tx.boardColumn.create({
      data: { boardId: board.id, name: 'In Progress', position: inProgressPosition },
    })
    const done = await tx.boardColumn.create({
      data: { boardId: board.id, name: 'Done', position: donePosition },
    })

    const design = await tx.taskLabel.create({
      data: { workspaceId, name: 'Design', color: '#8B5CF6' },
    })
    const infra = await tx.taskLabel.create({
      data: { workspaceId, name: 'Infrastructure', color: '#0EA5E9' },
    })

    // Each task is the first item in its column.
    const [position = 0] = evenlySpacedPositions(1)

    const announcement = await tx.task.create({
      data: {
        workspaceId,
        boardId: board.id,
        columnId: todo.id,
        title: 'Draft the launch announcement',
        description: 'Blog post + email. Keep it short.',
        priority: 'HIGH',
        position,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: alex.id,
      },
    })
    const ci = await tx.task.create({
      data: {
        workspaceId,
        boardId: board.id,
        columnId: inProgress.id,
        title: 'Set up the CI pipeline',
        priority: 'MEDIUM',
        position,
        createdById: alex.id,
      },
    })
    await tx.task.create({
      data: {
        workspaceId,
        boardId: board.id,
        columnId: done.id,
        title: 'Create the workspace',
        priority: 'LOW',
        position,
        createdById: alex.id,
        completedAt: new Date(),
      },
    })

    await tx.taskAssignee.createMany({
      data: [
        { taskId: announcement.id, workspaceId, userId: sam.id },
        { taskId: ci.id, workspaceId, userId: alex.id },
      ],
    })
    await tx.taskLabelAssignment.createMany({
      data: [
        { taskId: announcement.id, labelId: design.id, workspaceId },
        { taskId: ci.id, labelId: infra.id, workspaceId },
      ],
    })

    // --- Notification ----------------------------------------------------------
    await tx.notification.create({
      data: {
        userId: sam.id,
        workspaceId,
        actorId: alex.id,
        type: 'TASK_ASSIGNED',
        title: 'Alex assigned you “Draft the launch announcement”',
        entityType: 'TASK',
        entityId: announcement.id,
      },
    })
  })

  console.info(
    `Seeded workspace "${WORKSPACE_SLUG}": sign in as alex@example.com or sam@example.com with password ${SEED_PASSWORD}`,
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => disconnectPrisma())
