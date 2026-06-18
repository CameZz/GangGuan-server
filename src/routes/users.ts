// 用户路由

import { Router, Request, Response } from 'express'
import { userService } from '../services/user.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { broadcastAll } from '../ws/broadcast'

const router = Router()

// 所有路由需要登录
router.use(requireAuth)

// GET /api/users - 获取所有用户
router.get('/', async (req: Request, res: Response) => {
  try {
    const users = await userService.getAll()
    sendSuccess(res, { users })
  } catch (error) {
    console.error('获取用户列表失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取用户列表失败', 500)
  }
})

// GET /api/users/:id - 获取单个用户
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const user = await userService.getById(id)

    if (!user) {
      sendError(res, ErrorCodes.NOT_FOUND, '用户不存在', 404)
      return
    }

    sendSuccess(res, { user })
  } catch (error) {
    console.error('获取用户失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取用户失败', 500)
  }
})

// POST /api/users - 创建用户（需要管理员权限）
router.post('/', async (req: Request, res: Response) => {
  try {
    // 验证管理员权限
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin) {
      sendError(res, ErrorCodes.FORBIDDEN, '需要管理员权限', 403)
      return
    }

    const { employeeId, password, name, phone, email, avatar, role, isAdmin } = req.body

    // 参数验证
    if (!employeeId || !password || !name || !role) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '工号、密码、姓名和角色不能为空')
      return
    }

    // 验证工号是否已存在
    const exists = await userService.employeeIdExists(employeeId)
    if (exists) {
      sendError(res, ErrorCodes.DUPLICATE_ENTRY, '工号已存在', 409)
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
    console.error('创建用户失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '创建用户失败', 500)
  }
})

// PUT /api/users/:id - 更新用户
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const currentUserId = req.session.userId!

    // 验证权限：只能更新自己或管理员可以更新任何人
    if (id !== currentUserId) {
      const currentUser = await prisma.user.findUnique({
        where: { id: currentUserId }
      })

      if (!currentUser?.isAdmin) {
        sendError(res, ErrorCodes.FORBIDDEN, '只能更新自己的信息', 403)
        return
      }
    }

    // 验证用户是否存在
    const existingUser = await userService.getById(id)
    if (!existingUser) {
      sendError(res, ErrorCodes.NOT_FOUND, '用户不存在', 404)
      return
    }

    const { name, phone, email, avatar, role, isAdmin, password } = req.body

    const user = await userService.update(id, {
      name,
      phone,
      email,
      avatar,
      role,
      isAdmin,
      password
    })

    broadcastAll('user:update', user)
    sendSuccess(res, { user })
  } catch (error) {
    console.error('更新用户失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '更新用户失败', 500)
  }
})

// DELETE /api/users/:id - 删除用户（需要管理员权限）
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // 验证管理员权限
    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId! }
    })

    if (!currentUser?.isAdmin) {
      sendError(res, ErrorCodes.FORBIDDEN, '需要管理员权限', 403)
      return
    }

    const id = req.params.id as string

    // 验证用户是否存在
    const existingUser = await userService.getById(id)
    if (!existingUser) {
      sendError(res, ErrorCodes.NOT_FOUND, '用户不存在', 404)
      return
    }

    // 不能删除自己
    if (id === req.session.userId) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '不能删除自己')
      return
    }

    await userService.delete(id)
    broadcastAll('user:delete', { id })

    sendSuccess(res, { message: '用户已删除' })
  } catch (error) {
    console.error('删除用户失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '删除用户失败', 500)
  }
})

export default router
