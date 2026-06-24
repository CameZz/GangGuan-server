// 规划服务

import { Planning } from '@prisma/client'
import { prisma } from '../utils/prisma'

// 创建规划参数
interface CreatePlanningParams {
  name: string
  color?: string | null
  deadline?: string | null
}

// 更新规划参数
interface UpdatePlanningParams {
  name?: string
  color?: string | null
  deadline?: string | null
}

export class PlanningService {
  // 获取项目的所有规划
  async getByProject(projectId: string): Promise<Planning[]> {
    return prisma.planning.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    })
  }

  // 根据 ID 获取规划
  async getById(id: string): Promise<Planning | null> {
    return prisma.planning.findUnique({
      where: { id }
    })
  }

  // 创建规划
  async create(projectId: string, data: CreatePlanningParams): Promise<Planning> {
    return prisma.planning.create({
      data: {
        name: data.name,
        color: data.color || null,
        deadline: data.deadline ? new Date(data.deadline) : null,
        projectId
      }
    })
  }

  // 更新规划
  async update(id: string, data: UpdatePlanningParams): Promise<Planning> {
    return prisma.planning.update({
      where: { id },
      data: {
        name: data.name,
        color: data.color !== undefined ? data.color : undefined,
        deadline: data.deadline ? new Date(data.deadline) : null
      }
    })
  }

  // 删除规划（关联任务 planningId 置空）
  async delete(id: string): Promise<void> {
    // 将关联任务的 planningId 置空
    await prisma.task.updateMany({
      where: { planningId: id },
      data: { planningId: null }
    })

    await prisma.planning.delete({
      where: { id }
    })
  }

  // 验证规划是否存在
  async exists(id: string): Promise<boolean> {
    const count = await prisma.planning.count({
      where: { id }
    })
    return count > 0
  }
}

export const planningService = new PlanningService()
