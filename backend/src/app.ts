import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import apiRoutes from './routes/index.js'

function parsePositiveInteger(value: string | number | undefined, fallback: number): number {
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
}

type AppOptions = {
  rateLimitMax?: number
  rateLimitWindowMs?: number
}

export function createApp(options: AppOptions = {}) {
  const windowMs =
    options.rateLimitWindowMs ??
    parsePositiveInteger(process.env.RATE_LIMIT_WINDOW_SEC, 60) * 1000
  const limit = parsePositiveInteger(options.rateLimitMax ?? process.env.RATE_LIMIT_MAX, 60)
  parsePositiveInteger(windowMs, 60_000)

  const app = express()

  app.set('trust proxy', 1)
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
      windowMs,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      handler(_request, response) {
        response.status(429).json({ error: 'Too many requests, please try again later' })
      },
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

  return app
}

const app = createApp()

export default app