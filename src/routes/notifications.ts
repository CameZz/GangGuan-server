import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { notificationService } from '../services/notification.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'

const router = Router()

router.use(requireAuth)

router.get('/', async (req: Request, res: Response) => {
  try {
    const unreadOnly = req.query.unread === 'true'
    const limit = req.query.limit ? Number(req.query.limit) : undefined
    const notifications = await notificationService.listForUser(req.session.userId!, { unreadOnly, limit })
    sendSuccess(res, { notifications })
  } catch (error) {
    console.error('获取消息列表失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取消息列表失败', 500)
  }
})

router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const count = await notificationService.unreadCount(req.session.userId!)
    sendSuccess(res, { count })
  } catch (error) {
    console.error('获取未读消息数失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取未读消息数失败', 500)
  }
})

router.patch('/read-all', async (req: Request, res: Response) => {
  try {
    const count = await notificationService.markAllRead(req.session.userId!)
    sendSuccess(res, { count })
  } catch (error) {
    console.error('标记全部消息已读失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '标记全部消息已读失败', 500)
  }
})

router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const notification = await notificationService.markRead(req.session.userId!, req.params.id as string)
    if (!notification) {
      sendError(res, ErrorCodes.NOT_FOUND, '消息不存在', 404)
      return
    }
    sendSuccess(res, { notification })
  } catch (error) {
    console.error('标记消息已读失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '标记消息已读失败', 500)
  }
})

export default router