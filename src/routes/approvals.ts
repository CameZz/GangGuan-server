// 任务申请审批路由

import { Router, Request, Response } from 'express'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { notificationService } from '../services/notification.service'

const router = Router()

function getQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const firstValue = value[0]
    return typeof firstValue === 'string' ? firstValue : undefined
  }

  return undefined
}
// 所有路由需要登录
router.use(requireAuth)

// 辅助函数：检查是否为 PM 或管理员
async function isPmOrAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  return user?.isAdmin || user?.role === 'pm'
}

// POST /api/approvals - 提交任务申请
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, remark, phaseSnapshot, projectId, planningId, parentRequirementId } = req.body
    const requesterId = req.session.userId!

    // 必填字段校验
    if (!title || !title.trim()) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '标题不能为空', 400)
      return
    }
    if (!remark || !remark.trim()) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '申请理由不能为空', 400)
      return
    }
    if (!projectId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '项目ID不能为空', 400)
      return
    }
    if (!planningId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '所属迭代不能为空', 400)
      return
    }

    // 验证项目存在
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      sendError(res, ErrorCodes.NOT_FOUND, '项目不存在', 404)
      return
    }

    // 验证迭代存在
    const planning = await prisma.planning.findUnique({ where: { id: planningId } })
    if (!planning) {
      sendError(res, ErrorCodes.NOT_FOUND, '迭代不存在', 404)
      return
    }

    // 创建申请记录
    const approval = await prisma.taskApprovalRequest.create({
      data: {
        title: title.trim(),
        remark: remark.trim(),
        phaseSnapshot: phaseSnapshot || [],
        projectId,
        planningId,
        parentRequirementId: parentRequirementId || null,
        requesterId
      },
      include: {
        requester: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      }
    })

    // 通知项目的所有 PM 和管理员
    const pmAndAdmins = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'pm' },
          { isAdmin: true }
        ]
      },
      select: { id: true }
    })

    const recipientIds = pmAndAdmins
      .map(u => u.id)
      .filter(id => id !== requesterId) // 不通知申请人自己

    if (recipientIds.length > 0) {
      await notificationService.createForRecipients(recipientIds, {
        type: 'approval_submitted',
        title: '新任务申请',
        body: `${approval.requester.name} 提交了任务申请「${approval.title}」`,
        actorId: requesterId,
        projectId
      })
    }

    sendSuccess(res, { approval }, 201)
  } catch (error) {
    console.error('提交任务申请失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '提交任务申请失败', 500)
  }
})

// GET /api/approvals - 获取审批列表
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!
    const status = getQueryString(req.query.status)
    const projectId = getQueryString(req.query.projectId)

    // PM/管理员可查看所有，普通用户只能查看自己提交的
    const isPM = await isPmOrAdmin(userId)
    const where: any = {}
    if (!isPM) {
      where.requesterId = userId
    }
    if (status && status !== 'all') {
      where.status = status
    }
    if (projectId && projectId !== 'all') {
      where.projectId = projectId
    }

    const approvals = await prisma.taskApprovalRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, avatar: true, role: true } },
        reviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    sendSuccess(res, { approvals })
  } catch (error) {
    console.error('获取审批列表失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取审批列表失败', 500)
  }
})

// GET /api/approvals/:id - 获取单个申请详情
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!
    const id = req.params.id as string

    // 权限检查
    if (!(await isPmOrAdmin(userId))) {
      sendError(res, ErrorCodes.FORBIDDEN, '无权访问审批详情', 403)
      return
    }

    const approval = await prisma.taskApprovalRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, avatar: true, role: true } },
        reviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      }
    })

    if (!approval) {
      sendError(res, ErrorCodes.NOT_FOUND, '申请不存在', 404)
      return
    }

    sendSuccess(res, { approval })
  } catch (error) {
    console.error('获取审批详情失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取审批详情失败', 500)
  }
})

// POST /api/approvals/:id/approve - 审批通过
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!
    const id = req.params.id as string

    // 权限检查
    if (!(await isPmOrAdmin(userId))) {
      sendError(res, ErrorCodes.FORBIDDEN, '无权执行审批操作', 403)
      return
    }

    // 查找申请
    const approval = await prisma.taskApprovalRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true } }
      }
    })

    if (!approval) {
      sendError(res, ErrorCodes.NOT_FOUND, '申请不存在', 404)
      return
    }

    // 状态校验
    if (approval.status !== 'pending') {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '该申请已审批，不能重复操作', 400)
      return
    }

    // 更新申请状态
    const updated = await prisma.taskApprovalRequest.update({
      where: { id },
      data: {
        status: 'approved',
        reviewerId: userId,
        reviewedAt: new Date()
      },
      include: {
        requester: { select: { id: true, name: true, avatar: true, role: true } },
        reviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      }
    })

    // 通知申请人
    await notificationService.create({
      recipientId: approval.requesterId,
      type: 'approval_approved',
      title: '申请已通过',
      body: `您提交的任务申请「${approval.title}」已通过审批`,
      actorId: userId,
      projectId: approval.projectId
    })

    sendSuccess(res, { approval: updated })
  } catch (error) {
    console.error('审批通过失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '审批通过失败', 500)
  }
})

// POST /api/approvals/:id/reject - 审批驳回
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!
    const id = req.params.id as string
    const { reviewComment } = req.body

    // 权限检查
    if (!(await isPmOrAdmin(userId))) {
      sendError(res, ErrorCodes.FORBIDDEN, '无权执行审批操作', 403)
      return
    }

    // 驳回理由必填
    if (!reviewComment || !reviewComment.trim()) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '驳回理由不能为空', 400)
      return
    }

    // 查找申请
    const approval = await prisma.taskApprovalRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true } }
      }
    })

    if (!approval) {
      sendError(res, ErrorCodes.NOT_FOUND, '申请不存在', 404)
      return
    }

    // 状态校验
    if (approval.status !== 'pending') {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '该申请已审批，不能重复操作', 400)
      return
    }

    // 更新申请状态
    const updated = await prisma.taskApprovalRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewerId: userId,
        reviewComment: reviewComment.trim(),
        reviewedAt: new Date()
      },
      include: {
        requester: { select: { id: true, name: true, avatar: true, role: true } },
        reviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      }
    })

    // 通知申请人
    await notificationService.create({
      recipientId: approval.requesterId,
      type: 'approval_rejected',
      title: '申请已驳回',
      body: `您提交的任务申请「${approval.title}」已被驳回，理由：${reviewComment.trim()}`,
      actorId: userId,
      projectId: approval.projectId
    })

    sendSuccess(res, { approval: updated })
  } catch (error) {
    console.error('审批驳回失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '审批驳回失败', 500)
  }
})

export default router
