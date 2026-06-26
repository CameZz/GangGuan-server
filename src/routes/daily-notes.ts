import { Router, Request, Response } from 'express'
import { dailyNoteService } from '../services/daily-note.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { canOperateProject, getPermissionUser } from '../services/project-permission.service'

const router = Router()

router.use(requireAuth)

router.get('/projects/:projectId/daily-notes', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string }

    if (!startDate || !endDate) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'startDate and endDate are required', 400)
      return
    }

    const notes = await dailyNoteService.getByProjectAndDateRange(projectId, startDate, endDate)
    sendSuccess(res, { notes })
  } catch (error) {
    console.error('Failed to list daily notes:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list daily notes', 500)
  }
})

router.put('/projects/:projectId/daily-notes/:dateKey', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const currentUser = await getPermissionUser(req.session.userId!)
    if (!(await canOperateProject(currentUser, projectId))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project membership required', 403)
      return
    }

    const dateKey = req.params.dateKey as string
    const { content } = req.body
    const memberId = req.session.userId!

    if (typeof content !== 'string') {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'content is required', 400)
      return
    }

    const note = await dailyNoteService.upsert(projectId, memberId, dateKey, content)
    sendSuccess(res, { note })
  } catch (error) {
    console.error('Failed to save daily note:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to save daily note', 500)
  }
})

router.delete('/projects/:projectId/daily-notes/:dateKey', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const currentUser = await getPermissionUser(req.session.userId!)
    if (!(await canOperateProject(currentUser, projectId))) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Project membership required', 403)
      return
    }

    const dateKey = req.params.dateKey as string
    const memberId = req.session.userId!

    const deleted = await dailyNoteService.delete(projectId, memberId, dateKey)
    if (!deleted) {
      sendError(res, ErrorCodes.NOT_FOUND, 'Daily note not found', 404)
      return
    }

    sendSuccess(res, { success: true })
  } catch (error) {
    console.error('Failed to delete daily note:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to delete daily note', 500)
  }
})

export default router