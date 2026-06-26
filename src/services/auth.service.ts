// 认证服务

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { prisma } from '../utils/prisma'
import { User } from '@prisma/client'
import { config } from '../config'

const SALT_ROUNDS = 10

export interface JwtPayload {
  userId: string
  employeeId: string
  userVersion: number
}

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

  // 生成 JWT token
  generateToken(user: Omit<User, 'password'>): string {
    const payload: JwtPayload = {
      userId: user.id,
      employeeId: user.employeeId,
      userVersion: user.updatedAt.getTime()
    }
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    })
  }

  // 验证 JWT token
  verifyToken(token: string): JwtPayload | null {
    try {
      return jwt.verify(token, config.jwt.secret) as JwtPayload
    } catch {
      return null
    }
  }

  // 验证 JWT token，并确保 token 签发后用户资料/密码没有被更新。
  async verifyTokenWithUser(token: string): Promise<JwtPayload | null> {
    const payload = this.verifyToken(token)
    if (!payload?.userVersion) return null

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { updatedAt: true }
    })

    if (!user || user.updatedAt.getTime() !== payload.userVersion) return null
    return payload
  }

  // 通过 token 获取用户
  async getUserByToken(token: string): Promise<Omit<User, 'password'> | null> {
    const payload = await this.verifyTokenWithUser(token)
    if (!payload) return null

    return this.getUserById(payload.userId)
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
