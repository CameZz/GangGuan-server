// AuthService 单元测试

import { AuthService } from '../services/auth.service'

describe('AuthService', () => {
  let authService: AuthService

  beforeEach(() => {
    authService = new AuthService()
  })

  describe('hashPassword', () => {
    it('应该正确加密密码', async () => {
      const password = 'test123'
      const hash = await authService.hashPassword(password)

      expect(hash).toBeDefined()
      expect(hash).not.toBe(password)
      expect(hash.length).toBeGreaterThan(0)
    })

    it('相同密码应该生成不同的哈希', async () => {
      const password = 'test123'
      const hash1 = await authService.hashPassword(password)
      const hash2 = await authService.hashPassword(password)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('comparePassword', () => {
    it('应该验证正确的密码', async () => {
      const password = 'test123'
      const hash = await authService.hashPassword(password)

      const isValid = await authService.comparePassword(password, hash)
      expect(isValid).toBe(true)
    })

    it('应该拒绝错误的密码', async () => {
      const password = 'test123'
      const wrongPassword = 'wrong'
      const hash = await authService.hashPassword(password)

      const isValid = await authService.comparePassword(wrongPassword, hash)
      expect(isValid).toBe(false)
    })
  })
})
