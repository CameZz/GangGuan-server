import { Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import { connectionManager } from './connection'
import { prisma } from '../utils/prisma'
import { sessionStore } from '../middleware/session'
import { taskService } from '../services/task.service'
import { projectMemberUserSelect } from '../services/project.service'

function parseSessionId(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').map(cookie => cookie.trim())
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=')
    if (separatorIndex < 0) continue

    const name = cookie.slice(0, separatorIndex)
    const rawValue = cookie.slice(separatorIndex + 1)
    if (name !== 'connect.sid') continue

    const decoded = decodeURIComponent(rawValue)
    const signedValue = decoded.startsWith('s:') ? decoded.slice(2) : decoded
    return signedValue.split('.')[0] || null
  }

  return null
}

function getUserIdFromSession(sessionId: string): Promise<string | null> {
  return new Promise(resolve => {
    sessionStore.get(sessionId, (error, session: any) => {
      if (error || !session?.userId) {
        resolve(null)
        return
      }
      resolve(session.userId)
    })
  })
}

export function initWebSocket(httpServer: HttpServer): void {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  })

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('[WS] new connection')

    let userId: string | null = null

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())

        if (message.type === 'auth') {
          const sessionId = parseSessionId(req.headers.cookie)
          userId = sessionId ? await getUserIdFromSession(sessionId) : null

          if (!userId) {
            ws.close(4002, 'Login required')
            return
          }

          const user = await prisma.user.findUnique({
            where: { id: userId }
          })

          if (!user) {
            ws.close(4003, 'User not found')
            return
          }

          connectionManager.add(userId, ws)

          const projects = await prisma.project.findMany({
            include: {
              phaseTemplates: { orderBy: { order: 'asc' } },
              members: {
                include: { user: { select: projectMemberUserSelect } },
                orderBy: { createdAt: 'asc' as const }
              }
            }
          })

          const plannings = await prisma.planning.findMany()
          const tasks = await taskService.getAll()
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

          console.log(`[WS] user ${user.name}(${userId}) authenticated`)
          return
        }

        if (message.type === 'pong') {
          return
        }

        if (!userId) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Login required'
          }))
          return
        }

        console.log(`[WS] received message: ${message.type}`)
      } catch (error) {
        console.error('[WS] message handling error:', error)
      }
    })

    ws.on('close', (code, reason) => {
      if (userId) {
        connectionManager.remove(userId, ws)
        console.log(`[WS] user ${userId} disconnected: ${code} ${reason}`)
      }
    })

    ws.on('error', (error) => {
      console.error('[WS] connection error:', error)
      if (userId) {
        connectionManager.remove(userId, ws)
      }
    })

    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    ws.on('close', () => {
      clearInterval(heartbeatInterval)
    })
  })

  console.log('[WS] WebSocket server initialized')
}

export { broadcastAll, broadcastProject, sendTo } from './broadcast'