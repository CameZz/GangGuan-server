import { Router, Request, Response } from 'express'
import { taskService } from '../services/task.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { broadcastAll, broadcastProject } from '../ws/broadcast'
import { canManageProject, canOperateProject, getPermissionUser, validateAssigneesInProject } from '../services/project-permission.service'

const router = Router()

router.use(requireAuth)

async function planningBelongsToProject(projectId: string, planningId?: string | null): Promise<boolean> {
  if (!planningId) return true
  const planning = await prisma.planning.findUnique({ where: { id: planningId } })
  return !!planning && planning.projectId === projectId
}

async function parentRequirementBelongsToProject(projectId: string, parentRequirementId?: string | null): Promise<boolean> {
  if (!parentRequirementId) return true
  const requirement = await prisma.task.findUnique({ where: { id: parentRequirementId } })
  return !!requirement && requirement.projectId === projectId && requirement.itemType === 'requirement'
}

function collectPhaseAssigneeIds(phases: any[] | undefined): Array<string | null | undefined> {
  if (!Array.isArray(phases)) return []
  return phases.map(phase => phase?.assigneeId)
}

function preserveExistingReferences(existingTask: any, incoming: any[] | undefined, operatorId: string) {
  if (incoming === undefined) return undefined
  if (!Array.isArray(incoming)) return null

  const existingIds = new Set((existingTask.references || []).map((reference: any) => reference.id))
  const additions = incoming
    .filter(reference => !reference?.id || !existingIds.has(reference.id))
    .map(reference => ({
      type: reference.type || 'link',
      url: reference.url || '',
      title: reference.title || '',
      authorId: operatorId
    }))

  return [...(existingTask.references || []), ...additions]
}

function preserveExistingComments(existingTask: any, incoming: any[] | undefined, operatorId: string) {
  if (incoming === undefined) return undefined
  if (!Array.isArray(incoming)) return null

  const existingIds = new Set((existingTask.comments || []).map((comment: any) => comment.id))
  const additions = incoming
    .filter(comment => !comment?.id || !existingIds.has(comment.id))
    .map(comment => ({
      content: comment.content || '',
      authorId: operatorId
    }))

  return [...(existingTask.comments || []), ...additions]
}

router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const tasks = await taskService.getByProject(projectId)
    sendSuccess(res, { tasks })
  } catch (error) {
    console.error('Failed to list project tasks:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list tasks', 500)
  }
})

router.get('/planning/:planningId', async (req: Request, res: Response) => {
  try {
    const planningId = req.params.planningId as string
    const tasks = await taskService.getByPlanning(planningId)
    sendSuccess(res, { tasks })
  } catch (error) {
    console.error('Failed to list planning tasks:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list tasks', 500)
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const task = await taskService.getById(id)

    if (!task) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Task not found', 404)
      return
    }

    sendSuccess(res, { task })
  } catch (error) {
    console.error('Failed to get task:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get task', 500)
  }
})

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

    if (!projectId || !itemType || !title) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'projectId, itemType and title are required')
      return
    }

    const currentUser = await getPermissionUser(req.session.userId!)
    if (!(await canManageProject(currentUser, projectId))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
      return
    }

    if (!(await planningBelongsToProject(projectId, planningId))) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Planning does not belong to the project', 400)
      return
    }

    if (!(await parentRequirementBelongsToProject(projectId, parentRequirementId))) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Parent requirement does not belong to the project', 400)
      return
    }

    if (!(await validateAssigneesInProject(projectId, [assigneeId, ...collectPhaseAssigneeIds(phases)]))) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Assignees must be members of the project', 400)
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

    broadcastProject('task:create', task, task.projectId)
    sendSuccess(res, { task }, 201)
  } catch (error) {
    console.error('Failed to create task:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create task', 500)
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const existingTask = await taskService.getById(id)
    if (!existingTask) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Task not found', 404)
      return
    }

    const currentUser = await getPermissionUser(req.session.userId!)
    const isProjectManager = await canManageProject(currentUser, existingTask.projectId)
    const canOperate = await canOperateProject(currentUser, existingTask.projectId)

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

    if (isProjectManager) {
      if (!(await planningBelongsToProject(existingTask.projectId, planningId))) {
        sendError(res, ErrorCodes.VALIDATION_ERROR, 'Planning does not belong to the project', 400)
        return
      }

      if (!(await parentRequirementBelongsToProject(existingTask.projectId, parentRequirementId))) {
        sendError(res, ErrorCodes.VALIDATION_ERROR, 'Parent requirement does not belong to the project', 400)
        return
      }

      if (!(await validateAssigneesInProject(existingTask.projectId, [assigneeId, ...collectPhaseAssigneeIds(phases)]))) {
        sendError(res, ErrorCodes.VALIDATION_ERROR, 'Assignees must be members of the project', 400)
        return
      }

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
      if (!canOperate) {
        sendError(res, ErrorCodes.FORBIDDEN, 'Project membership required', 403)
        return
      }

      const hasRestrictedFields = [
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
        phases
      ].some(value => value !== undefined)

      if (hasRestrictedFields) {
        sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
        return
      }

      const safeReferences = preserveExistingReferences(existingTask, references, req.session.userId!)
      const safeComments = preserveExistingComments(existingTask, comments, req.session.userId!)

      if (safeReferences === null || safeComments === null) {
        sendError(res, ErrorCodes.VALIDATION_ERROR, 'references and comments must be arrays', 400)
        return
      }

      if (safeReferences === undefined && safeComments === undefined) {
        sendError(res, ErrorCodes.FORBIDDEN, 'No editable fields provided', 403)
        return
      }

      updateData = {
        references: safeReferences,
        comments: safeComments
      }
    }

    const task = await taskService.update(id, updateData, req.session.userId)

    broadcastProject('task:update', task, task.projectId)

    if (task.parentRequirementId) {
      const parent = await taskService.getById(task.parentRequirementId)
      if (parent) broadcastProject('task:update', parent, parent.projectId)
    }

    sendSuccess(res, { task })
  } catch (error) {
    console.error('Failed to update task:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update task', 500)
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const existingTask = await taskService.getById(id)
    if (!existingTask) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Task not found', 404)
      return
    }

    const currentUser = await getPermissionUser(req.session.userId!)
    if (!(await canManageProject(currentUser, existingTask.projectId))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
      return
    }

    if (existingTask.itemType !== 'requirement') {
      sendError(res, ErrorCodes.TASK_DELETE_NOT_ALLOWED, 'Task items cannot be deleted; mark them as abandoned instead', 400)
      return
    }

    const projectId = existingTask.projectId
    await taskService.delete(id)

    broadcastProject('task:delete', { id }, projectId)
    sendSuccess(res, { message: 'Task deleted' })
  } catch (error: any) {
    console.error('Failed to delete task:', error)
    if (error.message === 'Requirement has child tasks') {
      sendError(res, ErrorCodes.TASK_HAS_CHILDREN, 'Requirement has child tasks', 400)
    } else if (error.message === 'Task items cannot be deleted') {
      sendError(res, ErrorCodes.TASK_DELETE_NOT_ALLOWED, 'Task items cannot be deleted; mark them as abandoned instead', 400)
    } else {
      sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to delete task', 500)
    }
  }
})

router.patch('/:id/move', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const existingTask = await taskService.getById(id)
    if (!existingTask) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Task not found', 404)
      return
    }

    const currentUser = await getPermissionUser(req.session.userId!)
    if (!(await canManageProject(currentUser, existingTask.projectId))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
      return
    }

    const { status } = req.body

    if (!status) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'status is required')
      return
    }

    const task = await taskService.move(id, status, req.session.userId)
    broadcastProject('task:update', task, task.projectId)

    if (task.parentRequirementId) {
      const parent = await taskService.getById(task.parentRequirementId)
      if (parent) broadcastProject('task:update', parent, parent.projectId)
    }

    sendSuccess(res, { task })
  } catch (error) {
    console.error('Failed to move task:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to move task', 500)
  }
})

router.patch('/:id/phases/:phaseId/progress', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string
    const phaseId = req.params.phaseId as string
    const { progress } = req.body
    const numericProgress = Number(progress)

    if (progress === undefined || progress === null || !Number.isFinite(numericProgress)) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'progress must be a number')
      return
    }

    const taskBeforeUpdate = await taskService.getById(taskId)
    if (!taskBeforeUpdate) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Task not found', 404)
      return
    }

    const phase = taskBeforeUpdate.phases.find((item: any) => item.id === phaseId)
    if (!phase) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Phase not found', 404)
      return
    }

    const currentUser = await getPermissionUser(req.session.userId!)
    if (!(await canOperateProject(currentUser, taskBeforeUpdate.projectId))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project membership required', 403)
      return
    }

    if (!(await canManageProject(currentUser, taskBeforeUpdate.projectId)) && phase.assigneeId !== req.session.userId) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Can only update your assigned phase', 403)
      return
    }

    const task = await taskService.updatePhaseProgress(
      taskId,
      phaseId,
      numericProgress,
      req.session.userId!
    )

    broadcastProject('task:update', task, task.projectId)

    if (task.parentRequirementId) {
      const parent = await taskService.getById(task.parentRequirementId)
      if (parent) broadcastProject('task:update', parent, parent.projectId)
    }

    sendSuccess(res, { task })
  } catch (error: any) {
    console.error('Failed to update phase progress:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update phase progress', 500)
  }
})

export default router