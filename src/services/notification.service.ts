import { Notification } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { sendTo } from '../ws/broadcast'
import { NotificationType, WSMessageType } from '../types/enums'

export interface CreateNotificationInput {
  recipientId: string
  type: NotificationType
  title: string
  body: string
  actorId?: string | null
  projectId?: string | null
  planningId?: string | null
  taskId?: string | null
  phaseId?: string | null
  dedupeKey?: string | null
}

type ParticipantTask = {
  assigneeId: string | null
  phases: Array<{ assigneeId: string | null }>
}

class NotificationService {
  async listForUser(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        recipientId: userId,
        ...(options.unreadOnly ? { readAt: null } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(options.limit || 100, 1), 200)
    })
  }

  async unreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        recipientId: userId,
        readAt: null
      }
    })
  }

  async markRead(userId: string, notificationId: string): Promise<Notification | null> {
    const existing = await prisma.notification.findFirst({
      where: { id: notificationId, recipientId: userId }
    })
    if (!existing) return null

    const notification = await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: existing.readAt || new Date() }
    })
    sendTo(userId, WSMessageType.NotificationUpdate, notification)
    return notification
  }

  async markAllRead(userId: string): Promise<number> {
    const now = new Date()
    const result = await prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: now }
    })
    sendTo(userId, WSMessageType.NotificationReadAll, { readAt: now.toISOString(), count: result.count })
    return result.count
  }

  async create(input: CreateNotificationInput): Promise<Notification | null> {
    try {
      const notification = input.dedupeKey
        ? await prisma.notification.upsert({
            where: { dedupeKey: input.dedupeKey },
            update: {},
            create: this.toCreateData(input)
          })
        : await prisma.notification.create({ data: this.toCreateData(input) })

      sendTo(input.recipientId, WSMessageType.NotificationCreate, notification)
      return notification
    } catch (error) {
      console.error('创建通知失败:', error)
      return null
    }
  }

  async createForRecipients(recipients: string[], input: Omit<CreateNotificationInput, 'recipientId'>): Promise<void> {
    for (const recipientId of [...new Set(recipients)].filter(Boolean)) {
      await this.create({ ...input, recipientId })
    }
  }

  getParticipantIds(task: ParticipantTask, excludeUserId?: string | null): string[] {
    const ids = new Set<string>()
    if (task.assigneeId) ids.add(task.assigneeId)
    for (const phase of task.phases || []) {
      if (phase.assigneeId) ids.add(phase.assigneeId)
    }
    if (excludeUserId) ids.delete(excludeUserId)
    return [...ids]
  }

  async notifyComment(taskId: string, comment: { authorId: string; content: string }, actorId: string): Promise<void> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { phases: true }
    })
    if (!task) return

    const recipients = this.getParticipantIds(task, actorId)
    if (recipients.length === 0) return

    await this.createForRecipients(recipients, {
      type: NotificationType.Comment,
      title: '新评论通知',
      body: comment.content || '有人评论了你的任务',
      actorId,
      projectId: task.projectId,
      planningId: task.planningId,
      taskId: task.id
    })
  }

  async notifyReference(taskId: string, reference: { authorId?: string | null; title?: string; url?: string }, actorId: string): Promise<void> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { phases: true }
    })
    if (!task) return

    const recipients = this.getParticipantIds(task, actorId)
    if (recipients.length === 0) return

    await this.createForRecipients(recipients, {
      type: NotificationType.Reference,
      title: '新增参考资源',
      body: reference.title || reference.url || '有人添加了新的参考资源',
      actorId,
      projectId: task.projectId,
      planningId: task.planningId,
      taskId: task.id
    })
  }

  private toCreateData(input: CreateNotificationInput) {
    return {
      type: input.type,
      title: input.title,
      body: input.body,
      dedupeKey: input.dedupeKey || null,
      recipientId: input.recipientId,
      actorId: input.actorId || null,
      projectId: input.projectId || null,
      planningId: input.planningId || null,
      taskId: input.taskId || null,
      phaseId: input.phaseId || null
    }
  }
}

export const notificationService = new NotificationService()