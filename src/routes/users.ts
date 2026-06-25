import { Router, Request, Response } from 'express'
import { userService } from '../services/user.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { broadcastAll } from '../ws/broadcast'

const router = Router()

router.use(requireAuth)

router.get('/', async (req: Request, res: Response) => {
  try {
    const users = await userService.getAll()
    sendSuccess(res, { users })
  } catch (error) {
    console.error('Failed to list users:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to list users', 500)
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const user = await userService.getById(id)

    if (!user) {
      sendError(res, ErrorCodes.NOT_FOUND, 'User not found', 404)
      return
    }

    sendSuccess(res, { user })
  } catch (error) {
    console.error('Failed to get user:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get user', 500)
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Admin permission required', 403)
      return
    }

    const { employeeId, password, name, phone, email, avatar, role, isAdmin } = req.body

    if (!employeeId || !password || !name || !role) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'employeeId, password, name and role are required')
      return
    }

    const exists = await userService.employeeIdExists(employeeId)
    if (exists) {
      sendError(res, ErrorCodes.DUPLICATE_ENTRY, 'Employee ID already exists', 409)
      return
    }

    const user = await userService.create({
      employeeId,
      password,
      name,
      phone: phone || '',
      email: email || '',
      avatar: avatar || '',
      role,
      isAdmin: isAdmin || false
    })

    broadcastAll('user:create', user)
    sendSuccess(res, { user }, 201)
  } catch (error) {
    console.error('Failed to create user:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create user', 500)
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const currentUserId = req.session.userId!
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId }
    })

    if (!currentUser) {
      sendError(res, ErrorCodes.UNAUTHORIZED, 'Login required', 401)
      return
    }

    if (id !== currentUserId && !currentUser.isAdmin) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Can only update your own profile', 403)
      return
    }

    const existingUser = await userService.getById(id)
    if (!existingUser) {
      sendError(res, ErrorCodes.NOT_FOUND, 'User not found', 404)
      return
    }

    const { name, phone, email, avatar, role, isAdmin, password } = req.body
    const updateData = currentUser.isAdmin
      ? { name, phone, email, avatar, role, isAdmin, password }
      : { name, phone, email, avatar }

    const user = await userService.update(id, updateData)

    broadcastAll('user:update', user)
    sendSuccess(res, { user })
  } catch (error) {
    console.error('Failed to update user:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update user', 500)
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin) {
      sendError(res, ErrorCodes.FORBIDDEN, 'Admin permission required', 403)
      return
    }

    const id = req.params.id as string
    const existingUser = await userService.getById(id)
    if (!existingUser) {
      sendError(res, ErrorCodes.NOT_FOUND, 'User not found', 404)
      return
    }

    if (id === req.session.userId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, 'Cannot delete yourself')
      return
    }

    await userService.delete(id)
    broadcastAll('user:delete', { id })

    sendSuccess(res, { message: 'User deleted' })
  } catch (error) {
    console.error('Failed to delete user:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to delete user', 500)
  }
})

export default router