// 项目服务

import { Project, ProjectPhaseTemplate } from '@prisma/client'
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

// 创建项目参数
interface CreateProjectParams {
  name: string
  description?: string
  nonWorkdays?: unknown
  extraWorkdays?: unknown
  phaseTemplates?: PhaseTemplateInput[]
}

// 更新项目参数
interface UpdateProjectParams {
  name?: string
  description?: string
  nonWorkdays?: string[]
  extraWorkdays?: string[]
}

// 默认阶段模板
const DEFAULT_PHASE_TEMPLATES = [
  { name: '立案', order: 0 },
  { name: '设计', order: 1 },
  { name: '初版实现', order: 2 },
  { name: '初步验收', order: 3 },
  { name: '终版完成', order: 4 },
  { name: '最终验收', order: 5 },
  { name: '完成', order: 6 }
]

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
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
  // 获取所有项目
  async getAll(): Promise<(Project & { phaseTemplates: ProjectPhaseTemplate[] })[]> {
    return prisma.project.findMany({
      include: {
        phaseTemplates: {
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  // 根据 ID 获取项目
  async getById(id: string): Promise<(Project & { phaseTemplates: ProjectPhaseTemplate[] }) | null> {
    return prisma.project.findUnique({
      where: { id },
      include: {
        phaseTemplates: {
          orderBy: { order: 'asc' }
        }
      }
    })
  }

  // 创建项目
  async create(data: CreateProjectParams): Promise<Project & { phaseTemplates: ProjectPhaseTemplate[] }> {
    const phaseTemplates = normalizePhaseTemplates(data.phaseTemplates)

    return prisma.project.create({
      data: {
        name: data.name,
        description: typeof data.description === 'string' ? data.description : '',
        nonWorkdays: normalizeStringArray(data.nonWorkdays),
        extraWorkdays: normalizeStringArray(data.extraWorkdays),
        // 客户端可传阶段模板；未传时自动创建默认阶段模板
        phaseTemplates: {
          create: phaseTemplates.map(template => ({
            name: template.name,
            order: template.order,
            enabled: template.enabled
          }))
        }
      },
      include: {
        phaseTemplates: {
          orderBy: { order: 'asc' }
        }
      }
    })
  }

  // 更新项目
  async update(id: string, data: UpdateProjectParams): Promise<Project & { phaseTemplates: ProjectPhaseTemplate[] }> {
    return prisma.project.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        nonWorkdays: data.nonWorkdays,
        extraWorkdays: data.extraWorkdays
      },
      include: {
        phaseTemplates: {
          orderBy: { order: 'asc' }
        }
      }
    })
  }

  // 删除项目（级联删除关联数据）
  async delete(id: string): Promise<void> {
    await prisma.project.delete({
      where: { id }
    })
  }

  // 验证项目是否存在
  async exists(id: string): Promise<boolean> {
    const count = await prisma.project.count({
      where: { id }
    })
    return count > 0
  }

  // 获取项目成员 ID 列表（用于 WebSocket 广播）
  async getProjectMemberIds(projectId: string): Promise<string[]> {
    const tasks = await prisma.task.findMany({
      where: { projectId },
      select: {
        assigneeId: true,
        phases: {
          select: { assigneeId: true }
        }
      }
    })

    const memberIds = new Set<string>()
    tasks.forEach(task => {
      if (task.assigneeId) memberIds.add(task.assigneeId)
      task.phases.forEach(phase => {
        if (phase.assigneeId) memberIds.add(phase.assigneeId)
      })
    })

    return Array.from(memberIds)
  }
}

export const projectService = new ProjectService()
