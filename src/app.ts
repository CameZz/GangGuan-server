import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { config } from './config'
import { errorHandler } from './middleware/errorHandler'
import { sessionMiddleware } from './middleware/session'
import { prisma } from './utils/prisma'

import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import projectRoutes from './routes/projects'
import phaseTemplateRoutes from './routes/phase-templates'
import planningRoutes from './routes/plannings'
import taskRoutes from './routes/tasks'
import historyRoutes from './routes/histories'
import notificationRoutes from './routes/notifications'
import approvalRoutes from './routes/approvals'
import dailyNoteRoutes from './routes/daily-notes'

import { initWebSocket } from './ws'
import { reminderService } from './services/reminder.service'

const app = express()
const httpServer = createServer(app)

app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials
}))

app.use(express.json())

app.use(sessionMiddleware)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/projects', phaseTemplateRoutes)
app.use('/api/projects', planningRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api', historyRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/approvals', approvalRoutes)
app.use('/api', dailyNoteRoutes)

app.use(errorHandler)

async function start() {
  try {
    await prisma.$connect()
    console.log('Database connected')

    httpServer.listen(config.port, () => {
      console.log(`Server running: http://localhost:${config.port}`)
      console.log(`WebSocket: ws://localhost:${config.port}/ws`)
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
    })

    initWebSocket(httpServer)
    reminderService.start()
  } catch (error) {
    console.error('Server startup failed:', error)
    process.exit(1)
  }
}

async function shutdown() {
  console.log('\nShutting down server...')
  reminderService.stop()
  await prisma.$disconnect()
  httpServer.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start()

export { app, httpServer }