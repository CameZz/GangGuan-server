import { Router, Request, Response } from 'express'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { notificationService } from '../services/notification.service'

const router = Router()

function getQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const firstValue = value[0]
    return typeof firstValue === 'string' ? firstValue : undefined
  }
  return undefined
}

router.use(requireAuth)

async function isPmOrAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  return !!user && (user.isAdmin || user.role === 'pm')
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, remark, phaseSnapshot, projectId, planningId, parentRequirementId, assignedReviewerId } = req.body
    const requesterId = req.session.userId!

    if (!title || !title.trim()) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'title is required', 400)
      return
    }
    if (!remark || !remark.trim()) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'remark is required', 400)
      return
    }
    if (!projectId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'projectId is required', 400)
      return
    }
    if (!planningId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'planningId is required', 400)
      return
    }
    if (!assignedReviewerId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'assignedReviewerId is required', 400)
      return
    }

    // 校验 assignedReviewerId 是否为 PM 或管理员
    const reviewer = await prisma.user.findUnique({ where: { id: assignedReviewerId } })
    if (!reviewer) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Reviewer not found', 404)
      return
    }
    if (!reviewer.isAdmin && reviewer.role !== 'pm') {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Reviewer must be PM or admin', 400)
      return
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Project not found', 404)
      return
    }

    const planning = await prisma.planning.findUnique({ where: { id: planningId } })
    if (!planning) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Planning not found', 404)
      return
    }

    if (planning.projectId !== projectId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Planning does not belong to the project', 400)
      return
    }

    if (parentRequirementId) {
      const parent = await prisma.task.findUnique({ where: { id: parentRequirementId } })
      if (!parent || parent.projectId !== projectId || parent.itemType !== 'requirement') {
        sendError(res, ErrorCodes.VALIDATION_ERROR, 'Parent requirement does not belong to the project', 400)
        return
      }
    }

    const approval = await prisma.taskApprovalRequest.create({
      data: {
        title: title.trim(),
        remark: remark.trim(),
        phaseSnapshot: Array.isArray(phaseSnapshot) ? phaseSnapshot : [],
        projectId,
        planningId,
        parentRequirementId: parentRequirementId || null,
        requesterId,
        assignedReviewerId
      },
      include: {
        requester: { select: { id: true, name: true, avatar: true, role: true } },
        assignedReviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      }
    })

    // 仅通知指定审批人
    if (assignedReviewerId !== requesterId) {
      await notificationService.create({
        recipientId: assignedReviewerId,
        type: 'approval_submitted',
        title: '新任务申请',
        body: `${approval.requester.name} submitted task request: ${approval.title}`,
        actorId: requesterId,
        projectId
      })
    }

    sendSuccess(res, { approval }, 201)
  } catch (error) {
    console.error('Failed to submit approval:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to submit approval', 500)
  }
})

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!
    const status = getQueryString(req.query.status)
    const projectId = getQueryString(req.query.projectId)

    const isPM = await isPmOrAdmin(userId)
    const where: any = {}

    if (isPM) {
      // PM/Admin 只看到指派给自己的申请
      where.assignedReviewerId = userId
    } else {
      // 普通用户只看到自己的申请
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
        assignedReviewer: { select: { id: true, name: true, avatar: true, role: true } },
        reviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    sendSuccess(res, { approvals })
  } catch (error) {
    console.error('Failed to list approvals:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list approvals', 500)
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!
    const id = req.params.id as string

    const approval = await prisma.taskApprovalRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, avatar: true, role: true } },
        assignedReviewer: { select: { id: true, name: true, avatar: true, role: true } },
        reviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      }
    })

    if (!approval) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Approval not found', 404)
      return
    }

    // 申请者或指定审批人可查看
    if (approval.requesterId !== userId && approval.assignedReviewerId !== userId) {
      sendError(res, ErrorCodes.FORBIDDEN, 'No permission to view approval', 403)
      return
    }

    sendSuccess(res, { approval })
  } catch (error) {
    console.error('Failed to get approval:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get approval', 500)
  }
})

router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!
    const id = req.params.id as string

    const approval = await prisma.taskApprovalRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true } }
      }
    })

    if (!approval) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Approval not found', 404)
      return
    }

    // 仅指定审批人可审批
    if (approval.assignedReviewerId !== userId) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Only the assigned reviewer can approve this request', 403)
      return
    }

    if (approval.status !== 'pending') {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Approval has already been reviewed', 400)
      return
    }

    const updated = await prisma.taskApprovalRequest.update({
      where: { id },
      data: {
        status: 'approved',
        reviewerId: userId,
        reviewedAt: new Date()
      },
      include: {
        requester: { select: { id: true, name: true, avatar: true, role: true } },
        assignedReviewer: { select: { id: true, name: true, avatar: true, role: true } },
        reviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      }
    })

    await notificationService.create({
      recipientId: approval.requesterId,
      type: 'approval_approved',
      title: 'Request approved',
      body: `Your task request has been approved: ${approval.title}`,
      actorId: userId,
      projectId: approval.projectId
    })

    sendSuccess(res, { approval: updated })
  } catch (error) {
    console.error('Failed to approve request:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to approve request', 500)
  }
})

router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!
    const id = req.params.id as string
    const { reviewComment } = req.body

    if (!reviewComment || !reviewComment.trim()) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'reviewComment is required', 400)
      return
    }

    const approval = await prisma.taskApprovalRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true } }
      }
    })

    if (!approval) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Approval not found', 404)
      return
    }

    // 仅指定审批人可审批
    if (approval.assignedReviewerId !== userId) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Only the assigned reviewer can reject this request', 403)
      return
    }

    if (approval.status !== 'pending') {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Approval has already been reviewed', 400)
      return
    }

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
        assignedReviewer: { select: { id: true, name: true, avatar: true, role: true } },
        reviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      }
    })

    await notificationService.create({
      recipientId: approval.requesterId,
      type: 'approval_rejected',
      title: 'Request rejected',
      body: `Your task request has been rejected: ${approval.title}. Reason: ${reviewComment.trim()}`,
      actorId: userId,
      projectId: approval.projectId
    })

    sendSuccess(res, { approval: updated })
  } catch (error) {
    console.error('Failed to reject request:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to reject request', 500)
  }
})

// 取消申请（仅申请者可操作，仅 pending 可取消）
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!
    const id = req.params.id as string

    const approval = await prisma.taskApprovalRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true } },
        assignedReviewer: { select: { id: true, name: true } }
      }
    })

    if (!approval) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Approval not found', 404)
      return
    }

    // 仅申请者可取消
    if (approval.requesterId !== userId) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Only the requester can cancel this request', 403)
      return
    }

    // 仅 pending 可取消
    if (approval.status !== 'pending') {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Only pending requests can be cancelled', 400)
      return
    }

    const updated = await prisma.taskApprovalRequest.update({
      where: { id },
      data: {
        status: 'cancelled'
      },
      include: {
        requester: { select: { id: true, name: true, avatar: true, role: true } },
        assignedReviewer: { select: { id: true, name: true, avatar: true, role: true } },
        reviewer: { select: { id: true, name: true, avatar: true, role: true } },
        project: { select: { id: true, name: true } },
        planning: { select: { id: true, name: true, color: true } }
      }
    })

    // 通知指定审批人
    if (approval.assignedReviewerId && approval.assignedReviewerId !== userId) {
      await notificationService.create({
        recipientId: approval.assignedReviewerId,
        type: 'approval_cancelled',
        title: 'Request cancelled',
        body: `${approval.requester?.name || 'User'} cancelled task request: ${approval.title}`,
        actorId: userId,
        projectId: approval.projectId
      })
    }

    sendSuccess(res, { approval: updated })
  } catch (error) {
    console.error('Failed to cancel request:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to cancel request', 500)
  }
})

export default router