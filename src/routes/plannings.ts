// 规划路由

import { Router, Request, Response } from 'express'
import { planningService } from '../services/planning.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { broadcastAll } from '../ws/broadcast'

const router = Router()

// 所有路由需要登录
router.use(requireAuth)

// GET /api/projects/:projectId/plannings - 获取项目的所有规划
router.get('/:projectId/plannings', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const plannings = await planningService.getByProject(projectId)
    sendSuccess(res, { plannings })
  } catch (error) {
    console.error('获取规划列表失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取规划列表失败', 500)
  }
})

// GET /api/projects/:projectId/plannings/:planningId - 获取单个规划
router.get('/:projectId/plannings/:planningId', async (req: Request, res: Response) => {
  try {
    const id = req.params.planningId as string
    const planning = await planningService.getById(id)

    if (!planning) {
      sendError(res, ErrorCodes.NOT_FOUND, '规划不存在', 404)
      return
    }

    sendSuccess(res, { planning })
  } catch (error) {
    console.error('获取规划失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取规划失败', 500)
  }
})

// POST /api/projects/:projectId/plannings - 创建规划
router.post('/:projectId/plannings', async (req: Request, res: Response) => {
  try {
    // 验证权限
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin && currentUser?.role !== 'pm') {
      sendError(res, ErrorCodes.FORBIDDEN, '需要 PM 或管理员权限', 403)
      return
    }

    const projectId = req.params.projectId as string
    const { name, deadline } = req.body

    if (!name) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '规划名称不能为空')
      return
    }

    const planning = await planningService.create(projectId, { name, deadline })
    broadcastAll('planning:create', planning)
    sendSuccess(res, { planning }, 201)
  } catch (error) {
    console.error('创建规划失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '创建规划失败', 500)
  }
})

// PUT /api/projects/:projectId/plannings/:planningId - 更新规划
router.put('/:projectId/plannings/:planningId', async (req: Request, res: Response) => {
  try {
    // 验证权限
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin && currentUser?.role !== 'pm') {
      sendError(res, ErrorCodes.FORBIDDEN, '需要 PM 或管理员权限', 403)
      return
    }

    const id = req.params.planningId as string

    // 验证规划是否存在
    const existingPlanning = await planningService.getById(id)
    if (!existingPlanning) {
      sendError(res, ErrorCodes.NOT_FOUND, '规划不存在', 404)
      return
    }

    const { name, deadline } = req.body
    const planning = await planningService.update(id, { name, deadline })
    broadcastAll('planning:update', planning)

    sendSuccess(res, { planning })
  } catch (error) {
    console.error('更新规划失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '更新规划失败', 500)
  }
})

// DELETE /api/projects/:projectId/plannings/:planningId - 删除规划
router.delete('/:projectId/plannings/:planningId', async (req: Request, res: Response) => {
  try {
    // 验证权限
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin && currentUser?.role !== 'pm') {
      sendError(res, ErrorCodes.FORBIDDEN, '需要 PM 或管理员权限', 403)
      return
    }

    const id = req.params.planningId as string

    // 验证规划是否存在
    const existingPlanning = await planningService.getById(id)
    if (!existingPlanning) {
      sendError(res, ErrorCodes.NOT_FOUND, '规划不存在', 404)
      return
    }

    await planningService.delete(id)
    broadcastAll('planning:delete', { id })

    sendSuccess(res, { message: '规划已删除' })
  } catch (error) {
    console.error('删除规划失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '删除规划失败', 500)
  }
})

export default router
