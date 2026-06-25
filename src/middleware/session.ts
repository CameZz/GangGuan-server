import session from 'express-session'
import { config } from '../config'

export const sessionStore = new session.MemoryStore()

export const sessionMiddleware = session({
  store: sessionStore,
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: config.session.maxAge,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
})
