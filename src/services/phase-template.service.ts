// 阶段模板服务

import { ProjectPhaseTemplate } from '@prisma/client'
import { prisma } from '../utils/prisma'

// 创建模板参数
interface CreateTemplateParams {
  name: string
  enabled?: boolean
}

// 更新模板参数
interface UpdateTemplateParams {
  name?: string
  order?: number
  enabled?: boolean
}

export class PhaseTemplateService {
  // 获取项目的所有阶段模板
  async getByProject(projectId: string): Promise<ProjectPhaseTemplate[]> {
    return prisma.projectPhaseTemplate.findMany({
      where: { projectId },
      orderBy: { order: 'asc' }
    })
  }

  // 根据 ID 获取模板
  async getById(projectId: string, templateId: string): Promise<ProjectPhaseTemplate | null> {
    return prisma.projectPhaseTemplate.findFirst({
      where: {
        id: templateId,
        projectId
      }
    })
  }

  // 创建阶段模板
  async create(projectId: string, data: CreateTemplateParams): Promise<ProjectPhaseTemplate> {
    // 获取当前最大 order
    const maxOrder = await prisma.projectPhaseTemplate.aggregate({
      where: { projectId },
      _max: { order: true }
    })

    const nextOrder = (maxOrder._max.order ?? -1) + 1

    return prisma.projectPhaseTemplate.create({
      data: {
        name: data.name,
        order: nextOrder,
        enabled: data.enabled ?? true,
        projectId
      }
    })
  }

  // 更新阶段模板
  async update(projectId: string, templateId: string, data: UpdateTemplateParams): Promise<ProjectPhaseTemplate> {
    return prisma.projectPhaseTemplate.update({
      where: { id: templateId },
      data
    })
  }

  // 删除阶段模板（后续模板 order 自动前移）
  async delete(projectId: string, templateId: string): Promise<void> {
    const template = await this.getById(projectId, templateId)
    if (!template) {
      throw new Error('模板不存在')
    }

    // 删除模板
    await prisma.projectPhaseTemplate.delete({
      where: { id: templateId }
    })

    // 后续模板 order 前移
    await prisma.projectPhaseTemplate.updateMany({
      where: {
        projectId,
        order: { gt: template.order }
      },
      data: {
        order: { decrement: 1 }
      }
    })
  }

  // 批量重排序
  async reorder(projectId: string, templateIds: string[]): Promise<ProjectPhaseTemplate[]> {
    // 验证所有模板都属于该项目
    const templates = await prisma.projectPhaseTemplate.findMany({
      where: {
        id: { in: templateIds },
        projectId
      }
    })

    if (templates.length !== templateIds.length) {
      throw new Error('部分模板不存在或不属于该项目')
    }

    // 批量更新 order
    const updates = templateIds.map((id, index) =>
      prisma.projectPhaseTemplate.update({
        where: { id },
        data: { order: index }
      })
    )

    await prisma.$transaction(updates)

    // 返回更新后的列表
    return this.getByProject(projectId)
  }
}

export const phaseTemplateService = new PhaseTemplateService()
