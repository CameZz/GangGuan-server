// 任务路由

import { Router, Request, Response } from 'express'
import { taskService } from '../services/task.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { broadcastAll } from '../ws/broadcast'

const router = Router()

// 所有路由需要登录
router.use(requireAuth)

// GET /api/projects/:projectId/tasks - 获取项目的所有任务
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const tasks = await taskService.getByProject(projectId)
    sendSuccess(res, { tasks })
  } catch (error) {
    console.error('获取任务列表失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取任务列表失败', 500)
  }
})

// GET /api/plannings/:planningId/tasks - 获取规划的所有任务
router.get('/planning/:planningId', async (req: Request, res: Response) => {
  try {
    const planningId = req.params.planningId as string
    const tasks = await taskService.getByPlanning(planningId)
    sendSuccess(res, { tasks })
  } catch (error) {
    console.error('获取任务列表失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取任务列表失败', 500)
  }
})

// GET /api/tasks/:id - 获取单个任务
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const task = await taskService.getById(id)

    if (!task) {
      sendError(res, ErrorCodes.NOT_FOUND, '任务不存在', 404)
      return
    }

    sendSuccess(res, { task })
  } catch (error) {
    console.error('获取任务失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取任务失败', 500)
  }
})

// POST /api/tasks - 创建任务
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      projectId,
      planningId,
      itemType,
      parentRequirementId,
      title,
      description,
      priority,
      dueDate,
      assigneeId,
      phases,
      references,
      comments
    } = req.body

    // 参数验证
    if (!projectId || !itemType || !title) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '项目ID、任务类型和标题不能为空')
      return
    }

    const task = await taskService.create({
      projectId,
      planningId,
      itemType,
      parentRequirementId,
      title,
      description: description || '',
      priority: priority || 'medium',
      dueDate,
      assigneeId,
      phases,
      references,
      comments
    }, req.session.userId)

    broadcastAll('task:create', task)
    sendSuccess(res, { task }, 201)
  } catch (error) {
    console.error('创建任务失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '创建任务失败', 500)
  }
})

// PUT /api/tasks/:id - 更新任务
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string

    // 验证任务是否存在
    const existingTask = await taskService.getById(id)
    if (!existingTask) {
      sendError(res, ErrorCodes.NOT_FOUND, '任务不存在', 404)
      return
    }

    // 权限检查：PM/管理员可修改所有字段，普通成员只能修改评论、参考资料、阶段进度
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })
    const isPmOrAdmin = currentUser?.isAdmin || currentUser?.role === 'pm'

    const {
      title,
      description,
      status,
      priority,
      dueDate,
      assigneeId,
      planningId,
      parentRequirementId,
      stage,
      currentPhaseId,
      phases,
      references,
      comments
    } = req.body

    let updateData: any

    if (isPmOrAdmin) {
      // PM/管理员：可修改所有字段
      updateData = {
        title,
        description,
        status,
        priority,
        dueDate,
        assigneeId,
        planningId,
        parentRequirementId,
        stage,
        currentPhaseId,
        phases,
        references,
        comments
      }
    } else {
      // 普通成员：只能修改评论、参考资料、阶段进度（仅 progress）
      let allowedPhases = undefined
      if (phases !== undefined) {
        // 只保留进度字段，其他字段使用已有值
        allowedPhases = phases.map((phase: any) => {
          const existingPhase = existingTask.phases.find((p: any) => p.id === phase.id)
          return {
            id: phase.id,
            templateId: existingPhase?.templateId || phase.templateId,
            name: existingPhase?.name || phase.name,
            order: existingPhase?.order || phase.order,
            progress: phase.progress,
            status: existingPhase?.status || phase.status,
            startTime: existingPhase?.startTime || phase.startTime,
            endTime: existingPhase?.endTime || phase.endTime,
            assigneeId: existingPhase?.assigneeId || phase.assigneeId
          }
        })
      }
      updateData = {
        phases: allowedPhases,
        references,
        comments
      }
    }

    const task = await taskService.update(id, updateData, req.session.userId)

    broadcastAll('task:update', task)
    sendSuccess(res, { task })
  } catch (error) {
    console.error('更新任务失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '更新任务失败', 500)
  }
})

// DELETE /api/tasks/:id - 删除任务（仅 PM/管理员）
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string

    // 权限检查
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })
    if (!currentUser?.isAdmin && currentUser?.role !== 'pm') {
      sendError(res, ErrorCodes.FORBIDDEN, '需要 PM 或管理员权限', 403)
      return
    }

    // 验证任务是否存在
    const existingTask = await taskService.getById(id)
    if (!existingTask) {
      sendError(res, ErrorCodes.NOT_FOUND, '任务不存在', 404)
      return
    }

    await taskService.delete(id)

    broadcastAll('task:delete', { id })
    sendSuccess(res, { message: '任务已删除' })
  } catch (error: any) {
    console.error('删除任务失败:', error)
    if (error.message === '需求单下有子任务，不能删除') {
      sendError(res, ErrorCodes.TASK_HAS_CHILDREN, error.message, 400)
    } else {
      sendError(res, ErrorCodes.INTERNAL_ERROR, '删除任务失败', 500)
    }
  }
})

// PATCH /api/tasks/:id/move - 移动任务状态（仅 PM/管理员）
router.patch('/:id/move', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string

    // 权限检查
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })
    if (!currentUser?.isAdmin && currentUser?.role !== 'pm') {
      sendError(res, ErrorCodes.FORBIDDEN, '需要 PM 或管理员权限', 403)
      return
    }

    const { status } = req.body

    if (!status) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '状态不能为空')
      return
    }

    const task = await taskService.move(id, status, req.session.userId)
    broadcastAll('task:update', task)
    sendSuccess(res, { task })
  } catch (error) {
    console.error('移动任务失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '移动任务失败', 500)
  }
})

// PATCH /api/tasks/:id/phases/:phaseId/progress - 更新阶段进度
router.patch('/:id/phases/:phaseId/progress', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string
    const phaseId = req.params.phaseId as string
    const { progress } = req.body

    if (progress === undefined || progress === null) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '进度不能为空')
      return
    }

    const task = await taskService.updatePhaseProgress(
      taskId,
      phaseId,
      progress,
      req.session.userId!
    )

    broadcastAll('task:update', task)
    sendSuccess(res, { task })
  } catch (error: any) {
    console.error('更新阶段进度失败:', error)
    if (error.message === '任务不存在' || error.message === '阶段不存在') {
      sendError(res, ErrorCodes.NOT_FOUND, error.message, 404)
    } else {
      sendError(res, ErrorCodes.INTERNAL_ERROR, '更新阶段进度失败', 500)
    }
  }
})

export default router
