import { Router, Request, Response } from 'express'
import { authService } from '../services/auth.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'

const router = Router()

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { employeeId, password } = req.body

    if (!employeeId || !password) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'employeeId and password are required')
      return
    }

    const user = await authService.login(employeeId, password)

    if (!user) {
      sendError(res, ErrorCodes.INVALID_CREDENTIALS, 'Invalid employeeId or password', 401)
      return
    }

    req.session.regenerate((error) => {
      if (error) {
        console.error('Failed to regenerate session:', error)
        sendError(res, ErrorCodes.INTERNAL_ERROR, 'Login failed', 500)
        return
      }

      req.session.userId = user.id
      sendSuccess(res, { user })
    })
  } catch (error) {
    console.error('Login failed:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Login failed', 500)
  }
})

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout failed:', err)
      sendError(res, ErrorCodes.INTERNAL_ERROR, 'Logout failed', 500)
      return
    }
    res.clearCookie('connect.sid')
    sendSuccess(res, { message: 'Logged out' })
  })
})

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await authService.getUserById(req.session.userId!)

    if (!user) {
      sendError(res, ErrorCodes.NOT_FOUND, 'User not found', 404)
      return
    }

    sendSuccess(res, { user })
  } catch (error) {
    console.error('Failed to get current user:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get current user', 500)
  }
})

router.put('/password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'oldPassword and newPassword are required')
      return
    }

    if (String(newPassword).length < 6) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'newPassword must be at least 6 characters')
      return
    }

    const success = await authService.changePassword(req.session.userId!, oldPassword, newPassword)
    if (!success) {
      sendError(res, ErrorCodes.INVALID_CREDENTIALS, 'Old password is incorrect', 401)
      return
    }

    sendSuccess(res, { message: 'Password changed' })
  } catch (error) {
    console.error('Failed to change password:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to change password', 500)
  }
})

export default router