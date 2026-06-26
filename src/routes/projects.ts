import { Router, Request, Response } from 'express'
import { projectService } from '../services/project.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { broadcastAll } from '../ws/broadcast'
import { canBeReviewerInProject, canManageProject, getPermissionUser } from '../services/project-permission.service'

const router = Router()

router.use(requireAuth)

router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await projectService.getAll()
    sendSuccess(res, { projects })
  } catch (error) {
    console.error('Failed to list projects:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list projects', 500)
  }
})

router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    if (!(await projectService.exists(id))) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Project not found', 404)
      return
    }

    const members = await projectService.getMembers(id)
    sendSuccess(res, { members })
  } catch (error) {
    console.error('Failed to list project members:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list project members', 500)
  }
})

router.put('/:id/members', async (req: Request, res: Response) => {
  try {
    const currentUser = await getPermissionUser(req.session.userId!)
    if (!currentUser?.isAdmin) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Admin permission required', 403)
      return
    }

    const id = req.params.id as string
    const members = await projectService.replaceMembers(id, req.body.userIds)
    const project = await projectService.getById(id)

    if (project) broadcastAll('project:update', project)
    sendSuccess(res, { members })
  } catch (error: any) {
    console.error('Failed to update project members:', error)
    if (error.message === 'Project not found') {
      sendError(res, ErrorCodes.NOT_FOUND, 'Project not found', 404)
      return
    }
    if (String(error.message || '').startsWith('Members still have active assignments')) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, error.message, 400)
      return
    }
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update project members', 500)
  }
})

router.get('/:id/reviewer-candidates', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    if (!(await projectService.exists(id))) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Project not found', 404)
      return
    }

    const reviewers = await projectService.getReviewerCandidates(id)
    sendSuccess(res, { reviewers })
  } catch (error) {
    console.error('Failed to list reviewer candidates:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list reviewer candidates', 500)
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const project = await projectService.getById(id)

    if (!project) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Project not found', 404)
      return
    }

    sendSuccess(res, { project })
  } catch (error) {
    console.error('Failed to get project:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get project', 500)
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const currentUser = await getPermissionUser(req.session.userId!)
    if (!currentUser?.isAdmin && currentUser?.role !== 'pm') {
      sendError(res, ErrorCodes.FORBIDDEN, 'PM or admin permission required', 403)
      return
    }

    const { name, description, defaultReviewerId, nonWorkdays, extraWorkdays, phaseTemplates } = req.body
    const trimmedName = typeof name === 'string' ? name.trim() : ''

    if (!trimmedName) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Project name is required')
      return
    }
    if (!defaultReviewerId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Default reviewer is required')
      return
    }

    const reviewer = await prisma.user.findUnique({ where: { id: defaultReviewerId } })
    if (!reviewer || (!reviewer.isAdmin && reviewer.role !== 'pm')) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Default reviewer must be PM or admin')
      return
    }

    if (!currentUser.isAdmin && defaultReviewerId !== currentUser.id) {
      sendError(res, ErrorCodes.FORBIDDEN, 'PM can only create a project with themselves as default reviewer', 403)
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
    console.error('Failed to create project:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create project', 500)
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = await getPermissionUser(req.session.userId!)
    const id = req.params.id as string

    if (!(await canManageProject(currentUser, id))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
      return
    }

    const existingProject = await projectService.getById(id)
    if (!existingProject) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Project not found', 404)
      return
    }

    const { name, description, defaultReviewerId, nonWorkdays, extraWorkdays } = req.body

    if (defaultReviewerId && !(await canBeReviewerInProject(id, defaultReviewerId))) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Default reviewer must be authorized for this project')
      return
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
    console.error('Failed to update project:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update project', 500)
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = await getPermissionUser(req.session.userId!)
    const id = req.params.id as string

    if (!(await canManageProject(currentUser, id))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
      return
    }

    const existingProject = await projectService.getById(id)
    if (!existingProject) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Project not found', 404)
      return
    }

    await projectService.delete(id)

    broadcastAll('project:delete', { id })
    sendSuccess(res, { message: 'Project deleted' })
  } catch (error) {
    console.error('Failed to delete project:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to delete project', 500)
  }
})

export default router