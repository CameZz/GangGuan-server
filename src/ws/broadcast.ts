// WebSocket 广播工具

import { connectionManager } from './connection'
import { projectService } from '../services/project.service'

// 消息类型
type WSMessageType =
  | 'task:create' | 'task:update' | 'task:delete'
  | 'project:create' | 'project:update' | 'project:delete'
  | 'member:create' | 'member:update' | 'member:delete'
  | 'planning:create' | 'planning:update' | 'planning:delete'
  | 'user:login' | 'user:logout' | 'user:create' | 'user:update' | 'user:delete'
  | 'sync:init' | 'sync:update'
  | 'notification:create' | 'notification:update' | 'notification:read-all'

// 创建消息
function createMessage(type: WSMessageType, payload: any): string {
  return JSON.stringify({
    id: generateMessageId(),
    type,
    payload,
    timestamp: new Date().toISOString()
  })
}

// 生成消息 ID
function generateMessageId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

// 广播给所有在线用户
export function broadcastAll(type: WSMessageType, payload: any): void {
  const message = createMessage(type, payload)
  connectionManager.broadcast(message)
}

// 广播给项目成员
export async function broadcastProject(type: WSMessageType, payload: any, projectId: string): Promise<void> {
  try {
    const memberIds = await projectService.getProjectMemberIds(projectId)
    const message = createMessage(type, payload)
    connectionManager.broadcastToUsers(memberIds, message)
  } catch (error) {
    console.error('[WS] 广播项目消息失败:', error)
    // 降级：广播给所有人
    broadcastAll(type, payload)
  }
}

// 定向发送给指定用户
export function sendTo(userId: string, type: WSMessageType, payload: any): void {
  const message = createMessage(type, payload)
  connectionManager.send(userId, message)
}
