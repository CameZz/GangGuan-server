// 用户服务

import { User } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { authService } from './auth.service'

// 创建用户参数
interface CreateUserParams {
  employeeId: string
  password: string
  name: string
  phone: string
  email: string
  avatar: string
  role: string
  isAdmin?: boolean
}

// 更新用户参数
interface UpdateUserParams {
  name?: string
  phone?: string
  email?: string
  avatar?: string
  role?: string
  isAdmin?: boolean
  password?: string
}

export class UserService {
  // 获取所有用户
  async getAll(): Promise<Omit<User, 'password'>[]> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return users.map(({ password, ...user }) => user)
  }

  // 根据 ID 获取用户
  async getById(id: string): Promise<Omit<User, 'password'> | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    })
    if (!user) return null
    const { password, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  // 根据工号获取用户
  async getByEmployeeId(employeeId: string): Promise<Omit<User, 'password'> | null> {
    const user = await prisma.user.findUnique({
      where: { employeeId }
    })
    if (!user) return null
    const { password, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  // 创建用户
  async create(data: CreateUserParams): Promise<Omit<User, 'password'>> {
    const hashedPassword = await authService.hashPassword(data.password)

    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword
      }
    })

    const { password, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  // 更新用户
  async update(id: string, data: UpdateUserParams): Promise<Omit<User, 'password'>> {
    const updateData: any = { ...data }

    // 如果更新密码，需要加密
    if (data.password) {
      updateData.password = await authService.hashPassword(data.password)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData
    })

    const { password, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  // 删除用户
  async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id }
    })
  }

  // 验证用户是否存在
  async exists(id: string): Promise<boolean> {
    const count = await prisma.user.count({
      where: { id }
    })
    return count > 0
  }

  // 验证工号是否已存在
  async employeeIdExists(employeeId: string): Promise<boolean> {
    const count = await prisma.user.count({
      where: { employeeId }
    })
    return count > 0
  }
}

export const userService = new UserService()
