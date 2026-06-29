import { Prisma, Project, ProjectPhaseTemplate } from '@prisma/client'
import { prisma } from '../utils/prisma'

interface PhaseTemplateInput {
  name?: unknown
  order?: unknown
  enabled?: unknown
}

interface NormalizedPhaseTemplate {
  name: string
  order: number
  enabled: boolean
}

interface CreateProjectParams {
  name: string
  description?: string
  defaultReviewerId: string
  nonWorkdays?: unknown
  extraWorkdays?: unknown
  phaseTemplates?: PhaseTemplateInput[]
}

interface UpdateProjectParams {
  name?: string
  description?: string
  defaultReviewerId?: string
  nonWorkdays?: string[]
  extraWorkdays?: string[]
}

export const projectMemberUserSelect = {
  id: true,
  employeeId: true,
  name: true,
  phone: true,
  email: true,
  avatar: true,
  role: true,
  isAdmin: true
} satisfies Prisma.UserSelect

const projectInclude = {
  phaseTemplates: {
    orderBy: { order: 'asc' as const }
  },
  members: {
    include: {
      user: { select: projectMemberUserSelect }
    },
    orderBy: { createdAt: 'asc' as const }
  }
}

export type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>
export type ProjectMemberUser = Prisma.UserGetPayload<{ select: typeof projectMemberUserSelect }>

const DEFAULT_PHASE_TEMPLATES = [
  { name: '立案', order: 0 },
  { name: '设计', order: 1 },
  { name: '初版实现', order: 2 },
  { name: '初步验收', order: 3 },
  { name: '终版完成', order: 4 },
  { name: '最终验收', order: 5 }
]

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim()))]
}

function normalizePhaseTemplates(templates?: PhaseTemplateInput[]): NormalizedPhaseTemplate[] {
  const source: PhaseTemplateInput[] = Array.isArray(templates) && templates.length > 0
    ? templates
    : DEFAULT_PHASE_TEMPLATES.map(template => ({ ...template, enabled: true }))

  const normalized = source
    .map((template, index): NormalizedPhaseTemplate | null => {
      const name = typeof template.name === 'string' ? template.name.trim() : ''
      if (!name) return null

      const order = typeof template.order === 'number' && Number.isFinite(template.order)
        ? template.order
        : index

      return {
        name,
        order,
        enabled: template.enabled !== false
      }
    })
    .filter((template): template is NormalizedPhaseTemplate => template !== null)
    .sort((a, b) => a.order - b.order)
    .map((template, index) => ({ ...template, order: index }))

  return normalized.length > 0
    ? normalized
    : DEFAULT_PHASE_TEMPLATES.map(template => ({ ...template, enabled: true }))
}

export class ProjectService {
  async getAll(): Promise<ProjectWithRelations[]> {
    return prisma.project.findMany({
      include: projectInclude,
      orderBy: { createdAt: 'desc' }
    })
  }

  async getById(id: string): Promise<ProjectWithRelations | null> {
    return prisma.project.findUnique({
      where: { id },
      include: projectInclude
    })
  }

  async create(data: CreateProjectParams): Promise<ProjectWithRelations> {
    const phaseTemplates = normalizePhaseTemplates(data.phaseTemplates)

    return prisma.project.create({
      data: {
        name: data.name,
        description: typeof data.description === 'string' ? data.description : '',
        defaultReviewerId: data.defaultReviewerId,
        nonWorkdays: normalizeStringArray(data.nonWorkdays),
        extraWorkdays: normalizeStringArray(data.extraWorkdays),
        members: {
          create: [{ userId: data.defaultReviewerId }]
        },
        phaseTemplates: {
          create: phaseTemplates.map(template => ({
            name: template.name,
            order: template.order,
            enabled: template.enabled
          }))
        }
      },
      include: projectInclude
    })
  }

  async update(id: string, data: UpdateProjectParams): Promise<ProjectWithRelations> {
    return prisma.project.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        defaultReviewerId: data.defaultReviewerId,
        nonWorkdays: data.nonWorkdays,
        extraWorkdays: data.extraWorkdays
      },
      include: projectInclude
    })
  }

  async delete(id: string): Promise<void> {
    await prisma.project.delete({ where: { id } })
  }

  async exists(id: string): Promise<boolean> {
    const count = await prisma.project.count({ where: { id } })
    return count > 0
  }

  async getMembers(projectId: string): Promise<ProjectMemberUser[]> {
    const memberships = await prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: projectMemberUserSelect } },
      orderBy: { createdAt: 'asc' }
    })
    return memberships.map(item => item.user)
  }

  async getReviewerCandidates(projectId: string): Promise<ProjectMemberUser[]> {
    const [projectMembers, admins] = await Promise.all([
      prisma.projectMember.findMany({
        where: {
          projectId,
          user: {
            OR: [{ role: 'pm' }, { isAdmin: true }]
          }
        },
        include: { user: { select: projectMemberUserSelect } },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.user.findMany({
        where: { isAdmin: true },
        select: projectMemberUserSelect,
        orderBy: { name: 'asc' }
      })
    ])

    const byId = new Map<string, ProjectMemberUser>()
    projectMembers.forEach(member => byId.set(member.user.id, member.user))
    admins.forEach(admin => byId.set(admin.id, admin))
    return [...byId.values()]
  }

  async replaceMembers(projectId: string, userIdsInput: unknown): Promise<ProjectMemberUser[]> {
    const userIds = uniqueStrings(userIdsInput)
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) throw new Error('Project not found')

    const validUsers = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true }
    })
    const validUserIds = validUsers.map(user => user.id)

    const existing = await prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true }
    })
    const nextSet = new Set(validUserIds)
    const removing = existing.map(item => item.userId).filter(userId => !nextSet.has(userId))

    if (removing.length > 0) {
      const blocked = await this.findUsersWithActiveAssignments(projectId, removing)
      if (blocked.length > 0) {
        throw new Error(`Members still have active assignments: ${blocked.join(',')}`)
      }
    }

    await prisma.$transaction(async tx => {
      if (removing.length > 0) {
        await tx.projectMember.deleteMany({
          where: { projectId, userId: { in: removing } }
        })
      }

      if (validUserIds.length > 0) {
        await tx.projectMember.createMany({
          data: validUserIds.map(userId => ({ projectId, userId })),
          skipDuplicates: true
        })
      }
    })

    return this.getMembers(projectId)
  }

  async isProjectMember(projectId: string, userId: string): Promise<boolean> {
    const count = await prisma.projectMember.count({ where: { projectId, userId } })
    return count > 0
  }

  async isProjectMemberOrAdmin(projectId: string, user: { id: string; isAdmin: boolean }): Promise<boolean> {
    if (user.isAdmin) return true
    return this.isProjectMember(projectId, user.id)
  }

  async getProjectMemberIds(projectId: string): Promise<string[]> {
    const members = await prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true }
    })
    return members.map(member => member.userId)
  }

  private async findUsersWithActiveAssignments(projectId: string, userIds: string[]): Promise<string[]> {
    const activeTasks = await prisma.task.findMany({
      where: {
        projectId,
        assigneeId: { in: userIds },
        status: { notIn: ['done', 'abandoned'] }
      },
      select: { assigneeId: true }
    })

    const activePhases = await prisma.taskPhase.findMany({
      where: {
        assigneeId: { in: userIds },
        status: { not: 'done' },
        task: { projectId, status: { not: 'abandoned' } }
      },
      select: { assigneeId: true }
    })

    return [...new Set([
      ...activeTasks.map(task => task.assigneeId).filter((id): id is string => !!id),
      ...activePhases.map(phase => phase.assigneeId).filter((id): id is string => !!id)
    ])]
  }
}

export const projectService = new ProjectService()