// 统一响应格式

import { Response } from 'express'

interface SuccessResponse<T = any> {
  success: true
  data: T
}

interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse

// 成功响应
export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  const response: SuccessResponse<T> = {
    success: true,
    data
  }
  res.status(statusCode).json(response)
}

// 错误响应
export function sendError(res: Response, code: string, message: string, statusCode: number = 400): void {
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message
    }
  }
  res.status(statusCode).json(response)
}

// 常用错误码
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TASK_HAS_CHILDREN: 'TASK_HAS_CHILDREN',
  TASK_DELETE_NOT_ALLOWED: 'TASK_DELETE_NOT_ALLOWED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS'
} as const
