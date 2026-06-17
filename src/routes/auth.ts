// 认证路由

import { Router, Request, Response } from 'express'
import { authService } from '../services/auth.service'
import { sendSuccess, sendError, ErrorCodes } from '../utils/response'
import { requireAuth } from '../middleware/auth'

const router = Router()

// POST /api/auth/login - 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { employeeId, password } = req.body

    if (!employeeId || !password) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '工号和密码不能为空')
      return
    }

    const user = await authService.login(employeeId, password)

    if (!user) {
      sendError(res, ErrorCodes.INVALID_CREDENTIALS, '工号或密码错误', 401)
      return
    }

    // 保存用户 ID 到 session
    req.session.userId = user.id

    sendSuccess(res, { user })
  } catch (error) {
    console.error('登录失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '登录失败', 500)
  }
})

// POST /api/auth/logout - 登出
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('登出失败:', err)
      sendError(res, ErrorCodes.INTERNAL_ERROR, '登出失败', 500)
      return
    }
    res.clearCookie('connect.sid')
    sendSuccess(res, { message: '已登出' })
  })
})

// GET /api/auth/me - 获取当前用户
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await authService.getUserById(req.session.userId!)

    if (!user) {
      sendError(res, ErrorCodes.NOT_FOUND, '用户不存在', 404)
      return
    }

    sendSuccess(res, { user })
  } catch (error) {
    console.error('获取用户信息失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '获取用户信息失败', 500)
  }
})

export default router
