import { prisma } from '../utils/prisma'

export type PermissionUser = {
  id: string
  role: string
  isAdmin: boolean
}

export async function getPermissionUser(userId: string): Promise<PermissionUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isAdmin: true }
  })
}

export async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
  const count = await prisma.projectMember.count({ where: { projectId, userId } })
  return count > 0
}

export async function canOperateProject(user: PermissionUser | null | undefined, projectId: string): Promise<boolean> {
  if (!user) return false
  if (user.isAdmin) return true
  return isProjectMember(projectId, user.id)
}

export async function canManageProject(user: PermissionUser | null | undefined, projectId: string): Promise<boolean> {
  if (!user) return false
  if (user.isAdmin) return true
  if (user.role !== 'pm') return false
  return isProjectMember(projectId, user.id)
}

export async function canReviewInProject(user: PermissionUser | null | undefined, projectId: string): Promise<boolean> {
  return canManageProject(user, projectId)
}

export async function canBeAssignedInProject(projectId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return true
  return isProjectMember(projectId, userId)
}

export async function canBeReviewerInProject(projectId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const user = await getPermissionUser(userId)
  if (!user) return false
  if (!user.isAdmin && user.role !== 'pm') return false
  if (user.isAdmin) return true
  return isProjectMember(projectId, user.id)
}

export async function validateAssigneesInProject(projectId: string, assigneeIds: Array<string | null | undefined>): Promise<boolean> {
  const ids = [...new Set(assigneeIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return true

  const count = await prisma.projectMember.count({
    where: { projectId, userId: { in: ids } }
  })
  return count === ids.length
}