/**
 * DEVELOPMENT-ONLY large-data fixture for performance checks (NOT part of the
 * normal seed):
 *
 *   npm run db:seed:large --workspace @syncspace/api -- you@example.com
 *
 * In the first workspace the user OWNS, it creates (or refills):
 *  - #load-test with 1,000 messages spread over ~3 days (all workspace members as authors);
 *  - "Load test board" with 400 tasks across 4 columns (mixed priorities, due dates,
 *    assignees and labels).
 * Re-running replaces the previous load-test data.
 */
import { evenlySpacedPositions, LIMITS, TASK_PRIORITIES } from '@syncspace/shared'

import { disconnectPrisma, getPrisma } from '@/lib/prisma'

const MESSAGES = 1000
const TASKS = 400

async function main() {
  const email = process.argv[2]?.toLowerCase()
  if (!email) throw new Error('Usage: npm run db:seed:large -- <email of an existing user>')
  const prisma = getPrisma()

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) throw new Error(`No user with email ${email}`)
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, role: 'OWNER' },
    select: { workspaceId: true },
    orderBy: { joinedAt: 'asc' },
  })
  if (!membership) throw new Error('That user owns no workspace: create one in the app first.')
  const workspaceId = membership.workspaceId
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true },
  })
  const authorIds = members.map((member) => member.userId)

  // Messages ---------------------------------------------------------------------
  await prisma.channel.deleteMany({ where: { workspaceId, slug: 'load-test' } })
  const channel = await prisma.channel.create({
    data: {
      workspaceId,
      name: 'load-test',
      slug: 'load-test',
      description: `${String(MESSAGES)} messages for scroll and virtualization checks`,
      createdById: user.id,
    },
  })
  const start = Date.now() - 3 * 24 * 60 * 60 * 1000
  const step = Math.floor((3 * 24 * 60 * 60 * 1000) / MESSAGES)
  const lines = [
    'Short update.',
    'A longer message that wraps onto a second line on narrow screens, so row heights vary as they would in a real channel.',
    'Checking in on the release checklist — anything blocking?',
    'Multi-line\nmessage\nwith three lines.',
  ]
  await prisma.message.createMany({
    data: Array.from({ length: MESSAGES }, (_, i) => ({
      workspaceId,
      channelId: channel.id,
      authorId: authorIds[i % authorIds.length] ?? user.id,
      content: `#${String(i + 1)} ${lines[i % lines.length] ?? ''}`.slice(
        0,
        LIMITS.MESSAGE_CONTENT_MAX,
      ),
      createdAt: new Date(start + i * step),
    })),
  })

  // Tasks ----------------------------------------------------------------------------
  await prisma.board.deleteMany({ where: { workspaceId, name: 'Load test board' } })
  const columnNames = ['Backlog', 'To Do', 'In Progress', 'Done']
  const columnPositions = evenlySpacedPositions(columnNames.length)
  const board = await prisma.board.create({
    data: {
      workspaceId,
      name: 'Load test board',
      description: `${String(TASKS)} tasks for drag, filter and realtime checks`,
      createdById: user.id,
      columns: {
        create: columnNames.map((name, index) => ({ name, position: columnPositions[index] ?? 0 })),
      },
    },
    include: { columns: { orderBy: { position: 'asc' } } },
  })
  const labels = await Promise.all(
    [
      ['Load: bug', '#EF4444'],
      ['Load: feature', '#3B82F6'],
      ['Load: chore', '#64748B'],
    ].map(([name, color]) =>
      prisma.taskLabel.upsert({
        where: { workspaceId_name: { workspaceId, name: name ?? '' } },
        update: {},
        create: { workspaceId, name: name ?? '', color: color ?? '#64748B' },
      }),
    ),
  )
  const day = 24 * 60 * 60 * 1000
  const tasks = Array.from({ length: TASKS }, (_, i) => {
    const column = board.columns[i % board.columns.length]
    return {
      id: crypto.randomUUID(),
      workspaceId,
      boardId: board.id,
      columnId: column?.id ?? '',
      title: `Load task ${String(i + 1)}`,
      description: i % 5 === 0 ? 'Has a description with a few words to search for.' : null,
      priority: TASK_PRIORITIES[i % TASK_PRIORITIES.length] ?? 'MEDIUM',
      position: (Math.floor(i / board.columns.length) + 1) * 1024,
      dueDate: i % 3 === 0 ? new Date(Date.now() + ((i % 21) - 7) * day) : null,
      completedAt: column?.name === 'Done' ? new Date() : null,
      createdById: user.id,
    }
  })
  await prisma.task.createMany({ data: tasks })
  await prisma.taskAssignee.createMany({
    data: tasks
      .filter((_, i) => i % 2 === 0)
      .map((task, i) => ({
        taskId: task.id,
        workspaceId,
        userId: authorIds[i % authorIds.length] ?? user.id,
      })),
    skipDuplicates: true,
  })
  await prisma.taskLabelAssignment.createMany({
    data: tasks.map((task, i) => ({
      taskId: task.id,
      workspaceId,
      labelId: labels[i % labels.length]?.id ?? '',
    })),
  })

  console.info(
    `Load-test data ready in workspace ${workspaceId}: #load-test (${String(MESSAGES)} messages), "Load test board" (${String(TASKS)} tasks).`,
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => disconnectPrisma())
