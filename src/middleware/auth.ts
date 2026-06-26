// 认证中间件

import { Request, Response, NextFunction } from 'express'
import { sendError, ErrorCodes } from '../utils/response'
import { authService } from '../services/auth.service'

// 扩展 Request 类型
declare module 'express-session' {
  interface SessionData {
    userId: string
  }
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

// 需要登录（支持 session 和 Bearer token）
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // 优先检查 Bearer token
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const payload = await authService.verifyTokenWithUser(token)
    if (payload) {
      req.userId = payload.userId
      // 同时设置 session，保持兼容
      req.session.userId = payload.userId
      next()
      return
    }
  }

  // 回退到 session 认证
  if (req.session.userId) {
    req.userId = req.session.userId
    next()
    return
  }

  sendError(res, ErrorCodes.UNAUTHORIZED, '请先登录', 401)
}

// 仅接受当前 session，用于页面刷新时恢复登录状态，避免 remember token 静默登录。
export function requireSessionAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.userId) {
    req.userId = req.session.userId
    next()
    return
  }

  sendError(res, ErrorCodes.UNAUTHORIZED, '请先登录', 401)
}

// 仅接受 Bearer token，用于用户主动点击一键登录后换取新的 session。
export async function requireBearerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, ErrorCodes.UNAUTHORIZED, '请先登录', 401)
    return
  }

  const token = authHeader.slice(7)
  const payload = await authService.verifyTokenWithUser(token)
  if (!payload) {
    sendError(res, ErrorCodes.UNAUTHORIZED, '登录已过期，请重新登录', 401)
    return
  }

  req.userId = payload.userId
  req.session.userId = payload.userId
  next()
}

// 需要管理员权限
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // 优先检查 Bearer token
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const payload = await authService.verifyTokenWithUser(token)
    if (payload) {
      req.userId = payload.userId
      req.session.userId = payload.userId
      next()
      return
    }
  }

  // 回退到 session 认证
  if (req.session.userId) {
    req.userId = req.session.userId
    next()
    return
  }

  sendError(res, ErrorCodes.UNAUTHORIZED, '请先登录', 401)
}
