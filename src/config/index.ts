// 服务端配置加载

import * as fs from 'fs'
import * as path from 'path'

interface CorsConfig {
  origin: string[]
  credentials: boolean
}

interface SessionConfig {
  secret: string
  maxAge: number
}

interface ServerConfig {
  port: number
  cors: CorsConfig
  session: SessionConfig
}

// 读取 server.json 配置文件
const configPath = path.resolve(__dirname, '../../server.json')
let config: ServerConfig

try {
  const configData = fs.readFileSync(configPath, 'utf-8')
  config = JSON.parse(configData)
} catch (error) {
  console.error('无法读取 server.json 配置文件:', error)
  // 使用默认配置
  config = {
    port: 3001,
    cors: {
      origin: ['http://localhost:3000'],
      credentials: true
    },
    session: {
      secret: 'gangguan-session-secret-key-2026',
      maxAge: 86400000
    }
  }
}

export { config }
export type { ServerConfig, CorsConfig, SessionConfig }
