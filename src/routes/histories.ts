// 历史记录路由

import { Router, Request, Response } from 'express'
import { taskService } from '../services/task.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'

const router = Router()

// 所有路由需要登录
router.use(requireAuth)

// GET /api/tasks/:id/histories - 获取任务字段历史
router.get('/tasks/:id/histories', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string
    const histories = await taskService.getHistories(taskId)
    sendSuccess(res, { histories })
  } catch (error) {
    console.error('获取任务历史失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取任务历史失败', 500)
  }
})

// GET /api/tasks/:id/progress-histories - 获取任务进度历史
router.get('/tasks/:id/progress-histories', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string
    const histories = await taskService.getProgressHistories(taskId)
    sendSuccess(res, { histories })
  } catch (error) {
    console.error('获取进度历史失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取进度历史失败', 500)
  }
})

// GET /api/projects/:projectId/progress-histories - 获取项目的所有进度历史
router.get('/projects/:projectId/progress-histories', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const histories = await taskService.getProjectProgressHistories(projectId)
    sendSuccess(res, { histories })
  } catch (error) {
    console.error('获取项目进度历史失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取项目进度历史失败', 500)
  }
})

export default router
