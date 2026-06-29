import { Router, Request, Response } from 'express'
import { phaseTemplateService } from '../services/phase-template.service'
import { projectService } from '../services/project.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { broadcastAll, broadcastProject } from '../ws/broadcast'
import { canManageProject, getPermissionUser } from '../services/project-permission.service'
import { WSMessageType } from '../types/enums'

const router = Router()

router.use(requireAuth)

async function requireProjectManager(req: Request, res: Response): Promise<string | null> {
  const projectId = req.params.projectId as string
  const currentUser = await getPermissionUser(req.session.userId!)
  if (!(await canManageProject(currentUser, projectId))) {
    sendError(res, ErrorCodes.FORBIDDEN, 'Project management permission required', 403)
    return null
  }
  return projectId
}

router.get('/:projectId/phase-templates', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const templates = await phaseTemplateService.getByProject(projectId)
    sendSuccess(res, { templates })
  } catch (error) {
    console.error('Failed to list phase templates:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list phase templates', 500)
  }
})

router.post('/:projectId/phase-templates', async (req: Request, res: Response) => {
  try {
    const projectId = await requireProjectManager(req, res)
    if (!projectId) return

    const { name, enabled } = req.body

    if (!name) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Template name is required')
      return
    }

    const template = await phaseTemplateService.create(projectId, { name, enabled })
    const project = await projectService.getById(projectId)
    if (project) broadcastProject(WSMessageType.ProjectUpdate, project, projectId)
    sendSuccess(res, { template }, 201)
  } catch (error) {
    console.error('Failed to create phase template:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create phase template', 500)
  }
})

router.put('/:projectId/phase-templates/reorder', async (req: Request, res: Response) => {
  try {
    const projectId = await requireProjectManager(req, res)
    if (!projectId) return

    const { templateIds } = req.body

    if (!Array.isArray(templateIds)) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'templateIds must be an array')
      return
    }

    const templates = await phaseTemplateService.reorder(projectId, templateIds)
    const project = await projectService.getById(projectId)
    if (project) broadcastProject(WSMessageType.ProjectUpdate, project, projectId)
    sendSuccess(res, { templates })
  } catch (error) {
    console.error('Failed to reorder phase templates:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to reorder phase templates', 500)
  }
})

router.put('/:projectId/phase-templates/:templateId', async (req: Request, res: Response) => {
  try {
    const projectId = await requireProjectManager(req, res)
    if (!projectId) return

    const templateId = req.params.templateId as string
    const existingTemplate = await phaseTemplateService.getById(projectId, templateId)
    if (!existingTemplate) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Phase template not found', 404)
      return
    }

    const { name, order, enabled } = req.body
    const template = await phaseTemplateService.update(projectId, templateId, { name, order, enabled })
    const project = await projectService.getById(projectId)
    if (project) broadcastProject(WSMessageType.ProjectUpdate, project, projectId)

    sendSuccess(res, { template })
  } catch (error) {
    console.error('Failed to update phase template:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update phase template', 500)
  }
})

router.delete('/:projectId/phase-templates/:templateId', async (req: Request, res: Response) => {
  try {
    const projectId = await requireProjectManager(req, res)
    if (!projectId) return

    const templateId = req.params.templateId as string
    const existingTemplate = await phaseTemplateService.getById(projectId, templateId)
    if (!existingTemplate) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Phase template not found', 404)
      return
    }

    await phaseTemplateService.delete(projectId, templateId)
    const project = await projectService.getById(projectId)
    if (project) broadcastProject(WSMessageType.ProjectUpdate, project, projectId)

    sendSuccess(res, { message: 'Phase template deleted' })
  } catch (error) {
    console.error('Failed to delete phase template:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to delete phase template', 500)
  }
})

export default router