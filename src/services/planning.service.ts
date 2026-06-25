import { Planning } from '@prisma/client'
import { prisma } from '../utils/prisma'

interface CreatePlanningParams {
  name: string
  color?: string | null
  deadline?: string | null
}

interface UpdatePlanningParams {
  name?: string
  color?: string | null
  deadline?: string | null
}

export class PlanningService {
  async getByProject(projectId: string): Promise<Planning[]> {
    return prisma.planning.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    })
  }

  async getById(id: string): Promise<Planning | null> {
    return prisma.planning.findUnique({
      where: { id }
    })
  }

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

  async update(id: string, data: UpdatePlanningParams): Promise<Planning> {
    return prisma.planning.update({
      where: { id },
      data: {
        name: data.name,
        color: data.color !== undefined ? data.color : undefined,
        deadline: data.deadline === undefined ? undefined : (data.deadline ? new Date(data.deadline) : null)
      }
    })
  }

  async delete(id: string): Promise<void> {
    await prisma.task.updateMany({
      where: { planningId: id },
      data: { planningId: null }
    })

    await prisma.planning.delete({
      where: { id }
    })
  }

  async exists(id: string): Promise<boolean> {
    const count = await prisma.planning.count({
      where: { id }
    })
    return count > 0
  }
}

export const planningService = new PlanningService()