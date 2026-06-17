// 阶段模板路由

import { Router, Request, Response } from 'express'
import { phaseTemplateService } from '../services/phase-template.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'

const router = Router()

// 所有路由需要登录
router.use(requireAuth)

// GET /api/projects/:projectId/phase-templates - 获取项目的所有阶段模板
router.get('/:projectId/phase-templates', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const templates = await phaseTemplateService.getByProject(projectId)
    sendSuccess(res, { templates })
  } catch (error) {
    console.error('获取阶段模板失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取阶段模板失败', 500)
  }
})

// POST /api/projects/:projectId/phase-templates - 创建阶段模板
router.post('/:projectId/phase-templates', async (req: Request, res: Response) => {
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
    const { name, enabled } = req.body

    if (!name) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '模板名称不能为空')
      return
    }

    const template = await phaseTemplateService.create(projectId, { name, enabled })
    sendSuccess(res, { template }, 201)
  } catch (error) {
    console.error('创建阶段模板失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '创建阶段模板失败', 500)
  }
})

// PUT /api/projects/:projectId/phase-templates/:templateId - 更新阶段模板
router.put('/:projectId/phase-templates/:templateId', async (req: Request, res: Response) => {
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
    const templateId = req.params.templateId as string

    // 验证模板是否存在
    const existingTemplate = await phaseTemplateService.getById(projectId, templateId)
    if (!existingTemplate) {
      sendError(res, ErrorCodes.NOT_FOUND, '阶段模板不存在', 404)
      return
    }

    const { name, order, enabled } = req.body
    const template = await phaseTemplateService.update(projectId, templateId, { name, order, enabled })

    sendSuccess(res, { template })
  } catch (error) {
    console.error('更新阶段模板失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '更新阶段模板失败', 500)
  }
})

// DELETE /api/projects/:projectId/phase-templates/:templateId - 删除阶段模板
router.delete('/:projectId/phase-templates/:templateId', async (req: Request, res: Response) => {
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
    const templateId = req.params.templateId as string

    // 验证模板是否存在
    const existingTemplate = await phaseTemplateService.getById(projectId, templateId)
    if (!existingTemplate) {
      sendError(res, ErrorCodes.NOT_FOUND, '阶段模板不存在', 404)
      return
    }

    await phaseTemplateService.delete(projectId, templateId)

    sendSuccess(res, { message: '阶段模板已删除' })
  } catch (error) {
    console.error('删除阶段模板失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '删除阶段模板失败', 500)
  }
})

// PUT /api/projects/:projectId/phase-templates/reorder - 批量重排序
router.put('/:projectId/phase-templates/reorder', async (req: Request, res: Response) => {
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
    const { templateIds } = req.body

    if (!Array.isArray(templateIds)) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'templateIds 必须是数组')
      return
    }

    const templates = await phaseTemplateService.reorder(projectId, templateIds)
    sendSuccess(res, { templates })
  } catch (error) {
    console.error('重排序阶段模板失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '重排序阶段模板失败', 500)
  }
})

export default router
