// 项目路由

import { Router, Request, Response } from 'express'
import { projectService } from '../services/project.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { broadcastAll } from '../ws/broadcast'

const router = Router()

// 所有路由需要登录
router.use(requireAuth)

// GET /api/projects - 获取所有项目
router.get('/', async (req: Request, res: Response) => {
  try {
    const projects = await projectService.getAll()
    sendSuccess(res, { projects })
  } catch (error) {
    console.error('获取项目列表失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取项目列表失败', 500)
  }
})

// GET /api/projects/:id - 获取单个项目
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const project = await projectService.getById(id)

    if (!project) {
      sendError(res, ErrorCodes.NOT_FOUND, '项目不存在', 404)
      return
    }

    sendSuccess(res, { project })
  } catch (error) {
    console.error('获取项目失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取项目失败', 500)
  }
})

// POST /api/projects - 创建项目（PM 或管理员）
router.post('/', async (req: Request, res: Response) => {
  try {
    // 验证权限
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin && currentUser?.role !== 'pm') {
      sendError(res, ErrorCodes.FORBIDDEN, '需要 PM 或管理员权限', 403)
      return
    }

    const { name, description, defaultReviewerId, nonWorkdays, extraWorkdays, phaseTemplates } = req.body
    const trimmedName = typeof name === 'string' ? name.trim() : ''

    // 参数验证
    if (!trimmedName) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '项目名称不能为空')
      return
    }
    if (!defaultReviewerId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '请选择默认审批人')
      return
    }

    // 验证 defaultReviewerId 是否为 PM 或管理员
    const reviewer = await prisma.user.findUnique({ where: { id: defaultReviewerId } })
    if (!reviewer || (!reviewer.isAdmin && reviewer.role !== 'pm')) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '默认审批人必须是 PM 或管理员')
      return
    }

    const project = await projectService.create({
      name: trimmedName,
      description: typeof description === 'string' ? description.trim() : '',
      defaultReviewerId,
      nonWorkdays,
      extraWorkdays,
      phaseTemplates
    })

    broadcastAll('project:create', project)
    sendSuccess(res, { project }, 201)
  } catch (error) {
    console.error('创建项目失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '创建项目失败', 500)
  }
})

// PUT /api/projects/:id - 更新项目（PM 或管理员）
router.put('/:id', async (req: Request, res: Response) => {
  try {
    // 验证权限
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin && currentUser?.role !== 'pm') {
      sendError(res, ErrorCodes.FORBIDDEN, '需要 PM 或管理员权限', 403)
      return
    }

    const id = req.params.id as string

    // 验证项目是否存在
    const existingProject = await projectService.getById(id)
    if (!existingProject) {
      sendError(res, ErrorCodes.NOT_FOUND, '项目不存在', 404)
      return
    }

    const { name, description, defaultReviewerId, nonWorkdays, extraWorkdays } = req.body

    // 如果提供了 defaultReviewerId，验证其是否为 PM 或管理员
    if (defaultReviewerId) {
      const reviewer = await prisma.user.findUnique({ where: { id: defaultReviewerId } })
      if (!reviewer || (!reviewer.isAdmin && reviewer.role !== 'pm')) {
        sendError(res, ErrorCodes.VALIDATION_ERROR, '默认审批人必须是 PM 或管理员')
        return
      }
    }

    const project = await projectService.update(id, {
      name,
      description,
      defaultReviewerId,
      nonWorkdays,
      extraWorkdays
    })

    broadcastAll('project:update', project)
    sendSuccess(res, { project })
  } catch (error) {
    console.error('更新项目失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '更新项目失败', 500)
  }
})

// DELETE /api/projects/:id - 删除项目（PM 或管理员）
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // 验证权限
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin && currentUser?.role !== 'pm') {
      sendError(res, ErrorCodes.FORBIDDEN, '需要 PM 或管理员权限', 403)
      return
    }

    const id = req.params.id as string

    // 验证项目是否存在
    const existingProject = await projectService.getById(id)
    if (!existingProject) {
      sendError(res, ErrorCodes.NOT_FOUND, '项目不存在', 404)
      return
    }

    await projectService.delete(id)

    broadcastAll('project:delete', { id })
    sendSuccess(res, { message: '项目已删除' })
  } catch (error) {
    console.error('删除项目失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '删除项目失败', 500)
  }
})

export default router
