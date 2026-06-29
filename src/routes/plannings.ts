import { Router, Request, Response } from 'express'
import { planningService } from '../services/planning.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { broadcastAll, broadcastProject } from '../ws/broadcast'
import { canManageProject, getPermissionUser } from '../services/project-permission.service'
import { WSMessageType } from '../types/enums'

const router = Router()

router.use(requireAuth)

async function getPlanningForProject(projectId: string, planningId: string) {
  const planning = await planningService.getById(planningId)
  if (!planning || planning.projectId !== projectId) return null
  return planning
}

router.get('/:projectId/plannings', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const plannings = await planningService.getByProject(projectId)
    sendSuccess(res, { plannings })
  } catch (error) {
    console.error('Failed to list plannings:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list plannings', 500)
  }
})

router.get('/:projectId/plannings/:planningId', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const id = req.params.planningId as string
    const planning = await getPlanningForProject(projectId, id)

    if (!planning) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Planning not found in project', 404)
      return
    }

    sendSuccess(res, { planning })
  } catch (error) {
    console.error('Failed to get planning:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get planning', 500)
  }
})

router.post('/:projectId/plannings', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const currentUser = await getPermissionUser(req.session.userId!)
    if (!(await canManageProject(currentUser, projectId))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
      return
    }

    const projectExists = await prisma.project.count({ where: { id: projectId } })
    if (!projectExists) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Project not found', 404)
      return
    }

    const { name, color, deadline } = req.body

    if (!name) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'name is required')
      return
    }

    const planning = await planningService.create(projectId, { name, color, deadline })
    broadcastProject(WSMessageType.PlanningCreate, planning, projectId)
    sendSuccess(res, { planning }, 201)
  } catch (error) {
    console.error('Failed to create planning:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create planning', 500)
  }
})

router.put('/:projectId/plannings/:planningId', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const currentUser = await getPermissionUser(req.session.userId!)
    if (!(await canManageProject(currentUser, projectId))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
      return
    }

    const id = req.params.planningId as string
    const existingPlanning = await getPlanningForProject(projectId, id)
    if (!existingPlanning) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Planning not found in project', 404)
      return
    }

    const { name, color, deadline } = req.body
    const planning = await planningService.update(id, { name, color, deadline })
    broadcastProject(WSMessageType.PlanningUpdate, planning, projectId)

    sendSuccess(res, { planning })
  } catch (error) {
    console.error('Failed to update planning:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update planning', 500)
  }
})

router.delete('/:projectId/plannings/:planningId', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const currentUser = await getPermissionUser(req.session.userId!)
    if (!(await canManageProject(currentUser, projectId))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
      return
    }

    const id = req.params.planningId as string
    const existingPlanning = await getPlanningForProject(projectId, id)
    if (!existingPlanning) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Planning not found in project', 404)
      return
    }

    await planningService.delete(id)
    broadcastProject(WSMessageType.PlanningDelete, { id }, projectId)

    sendSuccess(res, { message: 'Planning deleted' })
  } catch (error) {
    console.error('Failed to delete planning:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to delete planning', 500)
  }
})

export default router