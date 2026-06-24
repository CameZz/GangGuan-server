// NotificationService 单元测试

// Mock prisma - must be defined before import due to jest.mock hoisting
const mockFindMany = jest.fn()
const mockCount = jest.fn()
const mockFindFirst = jest.fn()
const mockUpdate = jest.fn()
const mockUpdateMany = jest.fn()
const mockCreate = jest.fn()
const mockUpsert = jest.fn()
const mockTaskFindUnique = jest.fn()

jest.mock('../utils/prisma', () => ({
  prisma: {
    notification: {
      findMany: mockFindMany,
      count: mockCount,
      findFirst: mockFindFirst,
      update: mockUpdate,
      updateMany: mockUpdateMany,
      create: mockCreate,
      upsert: mockUpsert,
    },
    task: {
      findUnique: mockTaskFindUnique,
    },
  },
}))

const mockSendTo = jest.fn()
jest.mock('../ws/broadcast', () => ({
  sendTo: (...args: any[]) => mockSendTo(...args),
}))

import { notificationService } from '../services/notification.service'

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('listForUser', () => {
    it('should return notifications for the specified user', async () => {
      const mockNotifications = [
        { id: 'n1', recipientId: 'user1', title: 'Test 1' },
        { id: 'n2', recipientId: 'user1', title: 'Test 2' },
      ]
      mockFindMany.mockResolvedValue(mockNotifications)

      const result = await notificationService.listForUser('user1')

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { recipientId: 'user1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      expect(result).toEqual(mockNotifications)
    })

    it('should filter unread only when requested', async () => {
      mockFindMany.mockResolvedValue([])

      await notificationService.listForUser('user1', { unreadOnly: true })

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { recipientId: 'user1', readAt: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    })

    it('should clamp limit to max 200', async () => {
      mockFindMany.mockResolvedValue([])

      await notificationService.listForUser('user1', { limit: 500 })
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 })
      )
    })

    it('should default limit to 100 when not specified', async () => {
      mockFindMany.mockResolvedValue([])

      await notificationService.listForUser('user1')
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      )
    })
  })

  describe('unreadCount', () => {
    it('should return the count of unread notifications for user', async () => {
      mockCount.mockResolvedValue(5)

      const result = await notificationService.unreadCount('user1')

      expect(mockCount).toHaveBeenCalledWith({
        where: { recipientId: 'user1', readAt: null },
      })
      expect(result).toBe(5)
    })

    it('should return 0 when no unread notifications', async () => {
      mockCount.mockResolvedValue(0)

      const result = await notificationService.unreadCount('user1')
      expect(result).toBe(0)
    })
  })

  describe('markRead', () => {
    it('should mark a notification as read and send WebSocket update', async () => {
      const existing = { id: 'n1', recipientId: 'user1', readAt: null }
      const updated = { id: 'n1', recipientId: 'user1', readAt: new Date() }
      mockFindFirst.mockResolvedValue(existing)
      mockUpdate.mockResolvedValue(updated)

      const result = await notificationService.markRead('user1', 'n1')

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { id: 'n1', recipientId: 'user1' },
      })
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { readAt: expect.any(Date) },
      })
      expect(mockSendTo).toHaveBeenCalledWith('user1', 'notification:update', updated)
      expect(result).toEqual(updated)
    })

    it('should return null if notification not found or not owned by user', async () => {
      mockFindFirst.mockResolvedValue(null)

      const result = await notificationService.markRead('user1', 'n999')

      expect(result).toBeNull()
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockSendTo).not.toHaveBeenCalled()
    })

    it('should not overwrite existing readAt', async () => {
      const readDate = new Date('2025-01-01')
      const existing = { id: 'n1', recipientId: 'user1', readAt: readDate }
      mockFindFirst.mockResolvedValue(existing)
      mockUpdate.mockResolvedValue(existing)

      await notificationService.markRead('user1', 'n1')

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { readAt: readDate },
      })
    })
  })

  describe('markAllRead', () => {
    it('should mark all unread notifications as read and send WebSocket event', async () => {
      mockUpdateMany.mockResolvedValue({ count: 3 })

      const result = await notificationService.markAllRead('user1')

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { recipientId: 'user1', readAt: null },
        data: { readAt: expect.any(Date) },
      })
      expect(mockSendTo).toHaveBeenCalledWith('user1', 'notification:read-all', expect.objectContaining({
        count: 3,
        readAt: expect.any(String),
      }))
      expect(result).toBe(3)
    })

    it('should return 0 when no unread notifications exist', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 })

      const result = await notificationService.markAllRead('user1')
      expect(result).toBe(0)
    })
  })

  describe('create', () => {
    it('should create a notification and send WebSocket to recipient', async () => {
      const mockNotification = { id: 'n1', recipientId: 'user1', type: 'comment', title: 'Test' }
      mockCreate.mockResolvedValue(mockNotification)

      const result = await notificationService.create({
        recipientId: 'user1',
        type: 'comment',
        title: 'Test',
        body: 'Body',
      })

      expect(mockCreate).toHaveBeenCalled()
      expect(mockSendTo).toHaveBeenCalledWith('user1', 'notification:create', mockNotification)
      expect(result).toEqual(mockNotification)
    })

    it('should use upsert when dedupeKey is provided', async () => {
      const mockNotification = { id: 'n1', recipientId: 'user1', dedupeKey: 'key1' }
      mockUpsert.mockResolvedValue(mockNotification)

      await notificationService.create({
        recipientId: 'user1',
        type: 'behind_progress',
        title: 'Behind',
        body: 'Body',
        dedupeKey: 'key1',
      })

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { dedupeKey: 'key1' },
        update: {},
        create: expect.objectContaining({ dedupeKey: 'key1' }),
      })
    })

    it('should return null on error', async () => {
      mockCreate.mockRejectedValue(new Error('DB error'))

      const result = await notificationService.create({
        recipientId: 'user1',
        type: 'comment',
        title: 'Test',
        body: 'Body',
      })

      expect(result).toBeNull()
    })
  })

  describe('getParticipantIds', () => {
    it('should include task assignee and phase assignees', () => {
      const task = {
        assigneeId: 'user1',
        phases: [
          { assigneeId: 'user2' },
          { assigneeId: 'user3' },
        ],
      }

      const result = notificationService.getParticipantIds(task)

      expect(result).toContain('user1')
      expect(result).toContain('user2')
      expect(result).toContain('user3')
      expect(result).toHaveLength(3)
    })

    it('should exclude the specified user', () => {
      const task = {
        assigneeId: 'user1',
        phases: [{ assigneeId: 'user2' }],
      }

      const result = notificationService.getParticipantIds(task, 'user1')

      expect(result).not.toContain('user1')
      expect(result).toContain('user2')
    })

    it('should deduplicate participants', () => {
      const task = {
        assigneeId: 'user1',
        phases: [
          { assigneeId: 'user1' },
          { assigneeId: 'user2' },
        ],
      }

      const result = notificationService.getParticipantIds(task)

      expect(result.filter((id: string) => id === 'user1')).toHaveLength(1)
    })

    it('should handle null assigneeIds', () => {
      const task = {
        assigneeId: null,
        phases: [
          { assigneeId: null },
          { assigneeId: 'user2' },
        ],
      }

      const result = notificationService.getParticipantIds(task)

      expect(result).toEqual(['user2'])
    })
  })

  describe('notifyComment', () => {
    it('should create comment notifications for participants excluding the author', async () => {
      mockTaskFindUnique.mockResolvedValue({
        id: 'task1',
        projectId: 'proj1',
        planningId: 'plan1',
        assigneeId: 'user1',
        phases: [{ assigneeId: 'user2' }, { assigneeId: 'user3' }],
      })
      mockCreate.mockResolvedValue({ id: 'n1' })

      await notificationService.notifyComment('task1', { authorId: 'user1', content: 'Hello' }, 'user1')

      // Should notify user2 and user3, not user1 (the author)
      expect(mockCreate).toHaveBeenCalledTimes(2)
      const calls = mockCreate.mock.calls
      const recipientIds = calls.map((c: any[]) => c[0].data.recipientId)
      expect(recipientIds).toContain('user2')
      expect(recipientIds).toContain('user3')
      expect(recipientIds).not.toContain('user1')
    })

    it('should not create notifications if no other participants exist', async () => {
      mockTaskFindUnique.mockResolvedValue({
        id: 'task1',
        assigneeId: 'user1',
        phases: [],
      })

      await notificationService.notifyComment('task1', { authorId: 'user1', content: 'Hello' }, 'user1')

      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('should do nothing if task not found', async () => {
      mockTaskFindUnique.mockResolvedValue(null)

      await notificationService.notifyComment('nonexistent', { authorId: 'user1', content: 'Hello' }, 'user1')

      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  describe('notifyReference', () => {
    it('should create reference notifications for participants excluding the actor', async () => {
      mockTaskFindUnique.mockResolvedValue({
        id: 'task1',
        projectId: 'proj1',
        planningId: 'plan1',
        assigneeId: 'user1',
        phases: [{ assigneeId: 'user2' }],
      })
      mockCreate.mockResolvedValue({ id: 'n1' })

      await notificationService.notifyReference('task1', { title: 'Ref', url: 'http://example.com' }, 'user2')

      // Should notify user1 only (user2 is the actor)
      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(mockCreate.mock.calls[0][0].data.recipientId).toBe('user1')
    })
  })
})
