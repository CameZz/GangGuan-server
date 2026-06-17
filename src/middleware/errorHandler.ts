// 全局错误处理中间件

import { Request, Response, NextFunction } from 'express'
import { sendError, ErrorCodes } from '../utils/response'

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error('服务器错误:', err)

  // Prisma 错误处理
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any
    if (prismaErr.code === 'P2002') {
      sendError(res, ErrorCodes.DUPLICATE_ENTRY, '数据已存在', 409)
      return
    }
    if (prismaErr.code === 'P2025') {
      sendError(res, ErrorCodes.NOT_FOUND, '数据不存在', 404)
      return
    }
  }

  // 默认服务器错误
  sendError(res, ErrorCodes.INTERNAL_ERROR, '服务器内部错误', 500)
}
