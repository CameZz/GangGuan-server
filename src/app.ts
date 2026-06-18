// 钢管系统服务端入口

import express from 'express'
import cors from 'cors'
import session from 'express-session'
import { createServer } from 'http'
import { config } from './config'
import { errorHandler } from './middleware/errorHandler'
import { prisma } from './utils/prisma'

// 路由导入
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import projectRoutes from './routes/projects'
import phaseTemplateRoutes from './routes/phase-templates'
import planningRoutes from './routes/plannings'
import taskRoutes from './routes/tasks'
import historyRoutes from './routes/histories'

// WebSocket 导入
import { initWebSocket } from './ws'

const app = express()
const httpServer = createServer(app)

// ============ 中间件配置 ============

// CORS 跨域配置
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials
}))

// JSON 解析
app.use(express.json())

// Session 配置
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: config.session.maxAge,
    httpOnly: true,
    secure: false  // 开发环境不使用 HTTPS
  }
}))

// ============ 路由配置 ============

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 注册路由
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/projects', phaseTemplateRoutes)
app.use('/api/projects', planningRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api', historyRoutes)

// 错误处理中间件
app.use(errorHandler)

// ============ 启动服务器 ============

async function start() {
  try {
    // 测试数据库连接
    await prisma.$connect()
    console.log('✅ 数据库连接成功')

    // 启动 HTTP 服务器
    httpServer.listen(config.port, () => {
      console.log(`🚀 服务器已启动: http://localhost:${config.port}`)
      console.log(`📡 WebSocket 地址: ws://localhost:${config.port}/ws`)
      console.log(`🔧 环境: ${process.env.NODE_ENV || 'development'}`)
    })

    // 初始化 WebSocket
    initWebSocket(httpServer)

  } catch (error) {
    console.error('❌ 服务器启动失败:', error)
    process.exit(1)
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...')
  await prisma.$disconnect()
  httpServer.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n正在关闭服务器...')
  await prisma.$disconnect()
  httpServer.close()
  process.exit(0)
})

start()

export { app, httpServer }
