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
  timezone?: string
}

const DEFAULT_SESSION_SECRET = 'gangguan-session-secret-key-2026'
const configPath = path.resolve(__dirname, '../../server.json')
let config: ServerConfig

try {
  const configData = fs.readFileSync(configPath, 'utf-8')
  config = JSON.parse(configData)
} catch (error) {
  console.error('Failed to read server.json, using defaults:', error)
  config = {
    port: 3001,
    cors: {
      origin: ['http://localhost:3000'],
      credentials: true
    },
    session: {
      secret: DEFAULT_SESSION_SECRET,
      maxAge: 86400000
    }
  }
}

config.port = Number(process.env.PORT || config.port)
config.cors.origin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : config.cors.origin
config.session.secret = process.env.SESSION_SECRET || config.session.secret
config.session.maxAge = Number(process.env.SESSION_MAX_AGE || config.session.maxAge)
config.timezone = process.env.TZ || config.timezone || 'Asia/Shanghai'

if (process.env.NODE_ENV === 'production' && config.session.secret === DEFAULT_SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured in production')
}

export { config }
export type { ServerConfig, CorsConfig, SessionConfig }