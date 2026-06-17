// WebSocket 服务器初始化

import { Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import { connectionManager } from './connection'
import { prisma } from '../utils/prisma'

// 解析 Cookie 中的 Session ID
function parseSessionId(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').map(c => c.trim())
  for (const cookie of cookies) {
    const [name, value] = cookie.split('=')
    if (name === 'connect.sid') {
      // express-session 的 cookie 值格式: s%3A<sessionId>.<signature>
      const match = value.match(/^s%3A([^%.]+)/)
      return match ? decodeURIComponent(match[1]) : null
    }
  }
  return null
}

// 从 Session 获取 userId
async function getUserIdFromSession(sessionId: string): Promise<string | null> {
  try {
    // express-session 默认使用内存存储，我们需要通过其他方式验证
    // 由于我们使用内存存储，无法直接查询 session
    // 这里采用简化方案：客户端在连接时传递 userId，服务端验证

    // 注意：这是开发阶段的简化实现
    // 生产环境应该使用数据库存储 session 或 JWT
    return null
  } catch (error) {
    return null
  }
}

// 初始化 WebSocket 服务器
export function initWebSocket(httpServer: HttpServer): void {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  })

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('[WS] 新的 WebSocket 连接')

    let userId: string | null = null

    // 处理认证消息
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())

        // 认证消息
        if (message.type === 'auth') {
          userId = message.userId

          if (!userId) {
            ws.close(4002, '缺少用户ID')
            return
          }

          // 验证用户是否存在
          const user = await prisma.user.findUnique({
            where: { id: userId }
          })

          if (!user) {
            ws.close(4003, '用户不存在')
            return
          }

          // 添加到连接池（会踢掉旧连接）
          connectionManager.add(userId, ws)

          // 发送 sync:init（全量数据）
          const projects = await prisma.project.findMany({
            include: {
              phaseTemplates: { orderBy: { order: 'asc' } }
            }
          })

          const plannings = await prisma.planning.findMany()
          const tasks = await prisma.task.findMany({
            include: {
              phases: { orderBy: { order: 'asc' } },
              references: true,
              comments: true
            }
          })
          const users = await prisma.user.findMany({
            select: {
              id: true,
              employeeId: true,
              name: true,
              phone: true,
              email: true,
              avatar: true,
              role: true,
              isAdmin: true,
              createdAt: true,
              updatedAt: true
            }
          })

          ws.send(JSON.stringify({
            id: Date.now().toString(36),
            type: 'sync:init',
            payload: {
              projects,
              plannings,
              tasks,
              users
            },
            timestamp: new Date().toISOString()
          }))

          console.log(`[WS] 用户 ${user.name}(${userId}) 认证成功`)
          return
        }

        // 心跳响应
        if (message.type === 'pong') {
          return
        }

        // 其他消息需要已认证
        if (!userId) {
          ws.send(JSON.stringify({
            type: 'error',
            message: '请先认证'
          }))
          return
        }

        // 处理其他消息（如果需要）
        console.log(`[WS] 收到消息: ${message.type}`)

      } catch (error) {
        console.error('[WS] 消息处理错误:', error)
      }
    })

    // 处理连接关闭
    ws.on('close', (code, reason) => {
      if (userId) {
        connectionManager.remove(userId, ws)
        console.log(`[WS] 用户 ${userId} 断开连接: ${code} ${reason}`)
      }
    })

    // 处理错误
    ws.on('error', (error) => {
      console.error('[WS] 连接错误:', error)
      if (userId) {
        connectionManager.remove(userId, ws)
      }
    })

    // 设置心跳检测
    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    ws.on('close', () => {
      clearInterval(heartbeatInterval)
    })
  })

  console.log('[WS] WebSocket 服务器已初始化')
}

// 导出广播函数供 Service 层使用
export { broadcastAll, broadcastProject, sendTo } from './broadcast'
