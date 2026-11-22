import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import apiRoutes from './routes/index.js'

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('Rate-limit settings must be positive integers')
  }

  return parsed
}

const allowedOrigins = new Set(
  (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin),
)

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:5173')
  allowedOrigins.add('https://tester-it48sy49m-tester-1f8d.vercel.app')
}

const app = express()

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin is not allowed by CORS'))
    },
  }),
)
app.use(helmet())
app.use(express.json({ limit: '16kb' }))
app.use(
  rateLimit({
    windowMs: parsePositiveInteger(process.env.RATE_LIMIT_WINDOW_SEC, 60) * 1000,
    limit: parsePositiveInteger(process.env.RATE_LIMIT_MAX, 60),
    standardHeaders: true,
    legacyHeaders: false,
  }),
)
app.use('/api', apiRoutes)

app.use(
  (
    error: Error & { status?: number; type?: string },
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    if (response.headersSent) {
      return
    }

    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Request body must be valid JSON' })
      return
    }

    if (error.message === 'Origin is not allowed by CORS') {
      response.status(403).json({ error: error.message })
      return
    }

    response.status(error.status ?? 500).json({ error: 'The API could not process the request' })
  },
)

export default app