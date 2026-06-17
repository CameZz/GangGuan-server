// 认证中间件

import { Request, Response, NextFunction } from 'express'
import { sendError, ErrorCodes } from '../utils/response'

// 扩展 Request 类型
declare module 'express-session' {
  interface SessionData {
    userId: string
  }
}

// 需要登录
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    sendError(res, ErrorCodes.UNAUTHORIZED, '请先登录', 401)
    return
  }
  next()
}

// 需要管理员权限
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    sendError(res, ErrorCodes.UNAUTHORIZED, '请先登录', 401)
    return
  }
  // 管理员验证在具体路由中通过查询数据库实现
  next()
}
