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

// PUT /api/auth/password - 修改当前用户密码
router.put('/password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '旧密码和新密码不能为空')
      return
    }

    if (String(newPassword).length < 6) {
      sendError(res, ErrorCodes.VALIDATION_ERROR, '新密码长度不能少于 6 位')
      return
    }

    const success = await authService.changePassword(req.session.userId!, oldPassword, newPassword)
    if (!success) {
      sendError(res, ErrorCodes.INVALID_CREDENTIALS, '旧密码不正确', 401)
      return
    }

    sendSuccess(res, { message: '密码修改成功' })
  } catch (error) {
    console.error('修改密码失败:', error)
    sendError(res, ErrorCodes.INTERNAL_ERROR, '修改密码失败', 500)
  }
})

export default router
