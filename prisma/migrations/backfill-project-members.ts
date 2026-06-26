// Data migration: seed explicit project memberships from existing project activity.
// Run after creating project_members table:
//   npx ts-node prisma/migrations/backfill-project-members.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type ProjectSeed = {
  id: string
  name: string
  defaultReviewerId: string | null
}

function addUser(target: Set<string>, userId?: string | null) {
  if (userId) target.add(userId)
}

async function collectProjectUserIds(project: ProjectSeed): Promise<Set<string>> {
  const userIds = new Set<string>()
  addUser(userIds, project.defaultReviewerId)

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    select: {
      assigneeId: true,
      phases: { select: { assigneeId: true } }
    }
  })

  for (const task of tasks) {
    addUser(userIds, task.assigneeId)
    for (const phase of task.phases) addUser(userIds, phase.assigneeId)
  }

  const approvals = await prisma.taskApprovalRequest.findMany({
    where: { projectId: project.id },
    select: {
      requesterId: true,
      assignedReviewerId: true,
      reviewerId: true
    }
  })

  for (const approval of approvals) {
    addUser(userIds, approval.requesterId)
    addUser(userIds, approval.assignedReviewerId)
    addUser(userIds, approval.reviewerId)
  }

  const dailyNotes = await prisma.dailyNote.findMany({
    where: { projectId: project.id },
    select: { memberId: true }
  })

  for (const note of dailyNotes) addUser(userIds, note.memberId)

  return userIds
}

async function ensureMembership(projectId: string, userId: string) {
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: {},
    create: { projectId, userId }
  })
}

async function main() {
  console.log('Starting project membership backfill')

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, defaultReviewerId: true },
    orderBy: { createdAt: 'asc' }
  })

  for (const project of projects) {
    const userIds = await collectProjectUserIds(project)

    for (const userId of userIds) {
      await ensureMembership(project.id, userId)
    }

    const memberUsers = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, role: true, isAdmin: true }
    })

    const hasManager = memberUsers.some(user => user.isAdmin || user.role === 'pm')
    if (!hasManager) {
      console.warn(`[project-membership] Project "${project.name}" (${project.id}) has no participating PM/Admin after backfill; assign one manually.`)
    }

    console.log(`[project-membership] ${project.name}: ensured ${userIds.size} members`)
  }

  console.log('Project membership backfill complete')
}

main()
  .catch(error => {
    console.error('Project membership backfill failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
