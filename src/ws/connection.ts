// WebSocket 连接管理器（单用户单连接）

import { WebSocket } from 'ws'

export class ConnectionManager {
  // 连接池：userId -> WebSocket
  private pool: Map<string, WebSocket> = new Map()

  // 添加连接（如果已存在，踢掉旧连接）
  add(userId: string, ws: WebSocket): void {
    const oldWs = this.pool.get(userId)
    if (oldWs) {
      // 关闭旧连接，发送踢人消息
      try {
        oldWs.close(4001, '账号在别处登录')
      } catch (e) {
        // 忽略关闭错误
      }
    }
    this.pool.set(userId, ws)
    console.log(`[WS] 用户 ${userId} 已连接，当前在线: ${this.pool.size}`)
  }

  // 移除连接（只删除当前连接）
  remove(userId: string, ws: WebSocket): void {
    if (this.pool.get(userId) === ws) {
      this.pool.delete(userId)
      console.log(`[WS] 用户 ${userId} 已断开，当前在线: ${this.pool.size}`)
    }
  }

  // 获取用户连接
  get(userId: string): WebSocket | undefined {
    return this.pool.get(userId)
  }

  // 获取所有在线用户 ID
  getOnlineUserIds(): string[] {
    return Array.from(this.pool.keys())
  }

  // 获取在线用户数
  getCount(): number {
    return this.pool.size
  }

  // 检查用户是否在线
  isOnline(userId: string): boolean {
    return this.pool.has(userId)
  }

  // 发送消息给指定用户
  send(userId: string, message: string): boolean {
    const ws = this.pool.get(userId)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(message)
      return true
    }
    return false
  }

  // 广播消息给所有在线用户
  broadcast(message: string): void {
    this.pool.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message)
      }
    })
  }

  // 广播消息给指定用户列表
  broadcastToUsers(userIds: string[], message: string): void {
    userIds.forEach(userId => {
      this.send(userId, message)
    })
  }
}

// 单例
export const connectionManager = new ConnectionManager()
