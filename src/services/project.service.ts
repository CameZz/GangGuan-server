// 项目服务

import { Project, ProjectPhaseTemplate } from '@prisma/client'
import { prisma } from '../utils/prisma'

// 创建项目参数
interface CreateProjectParams {
  name: string
  description: string
  nonWorkdays?: string[]
  extraWorkdays?: string[]
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
    return prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        nonWorkdays: data.nonWorkdays || [],
        extraWorkdays: data.extraWorkdays || [],
        // 自动创建默认阶段模板
        phaseTemplates: {
          create: DEFAULT_PHASE_TEMPLATES.map(template => ({
            name: template.name,
            order: template.order,
            enabled: true
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
