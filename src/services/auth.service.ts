// 认证服务

import bcrypt from 'bcrypt'
import { prisma } from '../utils/prisma'
import { User } from '@prisma/client'

const SALT_ROUNDS = 10

export class AuthService {
  // 密码加密
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS)
  }

  // 密码验证
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  // 登录验证
  async login(employeeId: string, password: string): Promise<Omit<User, 'password'> | null> {
    const user = await prisma.user.findUnique({
      where: { employeeId }
    })

    if (!user) {
      return null
    }

    const isValid = await this.comparePassword(password, user.password)
    if (!isValid) {
      return null
    }

    // 返回用户信息（排除密码）
    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  // 根据 ID 获取用户
  async getUserById(id: string): Promise<Omit<User, 'password'> | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    })

    if (!user) {
      return null
    }

    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  async changePassword(id: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id }
    })

    if (!user) return false

    const isValid = await this.comparePassword(oldPassword, user.password)
    if (!isValid) return false

    await prisma.user.update({
      where: { id },
      data: {
        password: await this.hashPassword(newPassword)
      }
    })

    return true
  }
}

export const authService = new AuthService()
