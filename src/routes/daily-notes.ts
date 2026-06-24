// 每日备注路由

import { Router, Request, Response } from 'express'
import { dailyNoteService } from '../services/daily-note.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'

const router = Router()

router.use(requireAuth)

// GET /api/projects/:projectId/daily-notes?startDate=&endDate=
router.get('/projects/:projectId/daily-notes', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string }

    if (!startDate || !endDate) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'startDate 和 endDate 为必填参数', 400)
      return
    }

    const notes = await dailyNoteService.getByProjectAndDateRange(projectId, startDate, endDate)
    sendSuccess(res, { notes })
  } catch (error) {
    console.error('获取每日备注失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取每日备注失败', 500)
  }
})

// PUT /api/projects/:projectId/daily-notes/:dateKey
router.put('/projects/:projectId/daily-notes/:dateKey', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const dateKey = req.params.dateKey as string
    const { content } = req.body
    const memberId = req.session.userId!

    if (typeof content !== 'string') {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'content 为必填字段', 400)
      return
    }

    const note = await dailyNoteService.upsert(projectId, memberId, dateKey, content)
    sendSuccess(res, { note })
  } catch (error) {
    console.error('保存每日备注失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '保存每日备注失败', 500)
  }
})

// DELETE /api/projects/:projectId/daily-notes/:dateKey
router.delete('/projects/:projectId/daily-notes/:dateKey', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const dateKey = req.params.dateKey as string
    const memberId = req.session.userId!

    const deleted = await dailyNoteService.delete(projectId, memberId, dateKey)
    if (!deleted) {
      sendError(res, ErrorCodes.NOT_FOUND, '备注不存在', 404)
      return
    }

    sendSuccess(res, { success: true })
  } catch (error) {
    console.error('删除每日备注失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '删除每日备注失败', 500)
  }
})

export default router
