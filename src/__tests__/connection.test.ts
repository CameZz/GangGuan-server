// ConnectionManager 单元测试

import { ConnectionManager } from '../ws/connection'
import { WebSocket } from 'ws'

// Mock WebSocket
class MockWebSocket {
  readyState = WebSocket.OPEN
  close = jest.fn()
  send = jest.fn()
}

describe('ConnectionManager', () => {
  let manager: ConnectionManager

  beforeEach(() => {
    manager = new ConnectionManager()
  })

  describe('add', () => {
    it('应该添加连接', () => {
      const ws = new MockWebSocket() as any
      manager.add('user1', ws)

      expect(manager.get('user1')).toBe(ws)
      expect(manager.getCount()).toBe(1)
    })

    it('应该踢掉旧连接', () => {
      const oldWs = new MockWebSocket() as any
      const newWs = new MockWebSocket() as any

      manager.add('user1', oldWs)
      manager.add('user1', newWs)

      expect(oldWs.close).toHaveBeenCalledWith(4001, '账号在别处登录')
      expect(manager.get('user1')).toBe(newWs)
      expect(manager.getCount()).toBe(1)
    })
  })

  describe('remove', () => {
    it('应该移除连接', () => {
      const ws = new MockWebSocket() as any
      manager.add('user1', ws)
      manager.remove('user1', ws)

      expect(manager.get('user1')).toBeUndefined()
      expect(manager.getCount()).toBe(0)
    })

    it('不应该移除其他连接', () => {
      const ws1 = new MockWebSocket() as any
      const ws2 = new MockWebSocket() as any

      manager.add('user1', ws1)
      manager.remove('user1', ws2)

      expect(manager.get('user1')).toBe(ws1)
    })
  })

  describe('isOnline', () => {
    it('应该正确判断用户是否在线', () => {
      const ws = new MockWebSocket() as any

      expect(manager.isOnline('user1')).toBe(false)
      manager.add('user1', ws)
      expect(manager.isOnline('user1')).toBe(true)
    })
  })

  describe('broadcast', () => {
    it('应该广播消息给所有连接', () => {
      const ws1 = new MockWebSocket() as any
      const ws2 = new MockWebSocket() as any

      manager.add('user1', ws1)
      manager.add('user2', ws2)
      manager.broadcast('test message')

      expect(ws1.send).toHaveBeenCalledWith('test message')
      expect(ws2.send).toHaveBeenCalledWith('test message')
    })
  })

  describe('broadcastToUsers', () => {
    it('应该只广播给指定用户', () => {
      const ws1 = new MockWebSocket() as any
      const ws2 = new MockWebSocket() as any
      const ws3 = new MockWebSocket() as any

      manager.add('user1', ws1)
      manager.add('user2', ws2)
      manager.add('user3', ws3)
      manager.broadcastToUsers(['user1', 'user3'], 'test message')

      expect(ws1.send).toHaveBeenCalledWith('test message')
      expect(ws2.send).not.toHaveBeenCalled()
      expect(ws3.send).toHaveBeenCalledWith('test message')
    })
  })
})
