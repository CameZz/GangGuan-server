// 每日备注服务

import { DailyNote } from '@prisma/client'
import { prisma } from '../utils/prisma'

export class DailyNoteService {
  // 获取项目在日期范围内的所有备注
  async getByProjectAndDateRange(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyNote[]> {
    return prisma.dailyNote.findMany({
      where: {
        projectId,
        dateKey: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  // 创建或更新备注（upsert）
  async upsert(
    projectId: string,
    memberId: string,
    dateKey: string,
    content: string
  ): Promise<DailyNote> {
    return prisma.dailyNote.upsert({
      where: {
        memberId_projectId_dateKey: {
          memberId,
          projectId,
          dateKey
        }
      },
      update: { content },
      create: {
        projectId,
        memberId,
        dateKey,
        content
      }
    })
  }

  // 删除备注
  async delete(
    projectId: string,
    memberId: string,
    dateKey: string
  ): Promise<boolean> {
    try {
      await prisma.dailyNote.delete({
        where: {
          memberId_projectId_dateKey: {
            memberId,
            projectId,
            dateKey
          }
        }
      })
      return true
    } catch {
      return false
    }
  }
}

export const dailyNoteService = new DailyNoteService()
