import { timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  ConfigurationError,
  createTestTable,
  deleteTestTable,
  getReadiness,
  sendTestEmail,
  testSupabaseConnection,
} from '../service.js'

const router = Router()
const emailRequest = z.object({ to: z.string().email().max(254) })

function isValidTesterToken(expected: string, provided: string | undefined): boolean {
  if (!provided) {
    return false
  }

  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  )
}

function requireTesterToken(
  request: Request,
  response: Response,
  next: (error?: Error) => void,
): void {
  const expected = process.env.TESTER_TOKEN
  if (!expected) {
    response.status(503).json({ error: 'TESTER_TOKEN is not configured on Railway' })
    return
  }

  const authorization = request.header('authorization')
  const provided = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined

  if (!isValidTesterToken(expected, provided)) {
    response.status(401).json({ error: 'Enter the tester token configured on Railway' })
    return
  }

  next()
}

function sendIntegrationError(response: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown integration error'
  const status = error instanceof ConfigurationError ? 503 : 502
  response.status(status).json({ error: message })
}

router.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'social-platform-api',
    version: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    readiness: getReadiness(),
  })
})

router.post('/test/email', requireTesterToken, async (request, response) => {
  const parsed = emailRequest.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: 'Enter a valid recipient email address' })
    return
  }

  try {
    await sendTestEmail(parsed.data.to)
    response.json({ ok: true, message: 'Brevo accepted the test email' })
  } catch (error) {
    sendIntegrationError(response, error)
  }
})

router.post('/test/supabase/connection', requireTesterToken, async (_request, response) => {
  try {
    await testSupabaseConnection()
    response.json({ ok: true, message: 'Connected to Supabase Postgres' })
  } catch (error) {
    sendIntegrationError(response, error)
  }
})

router.post('/test/supabase/table', requireTesterToken, async (_request, response) => {
  try {
    const result = await createTestTable()
    response.json({
      ok: true,
      ...result,
      table: 'public.social_platform_connection_smoke_test',
      message: result.created ? 'Smoke-test table created' : 'Smoke-test table already exists',
    })
  } catch (error) {
    sendIntegrationError(response, error)
  }
})

router.delete('/test/supabase/table', requireTesterToken, async (_request, response) => {
  try {
    const result = await deleteTestTable()
    response.json({
      ok: true,
      ...result,
      table: 'public.social_platform_connection_smoke_test',
      message: result.deleted ? 'Smoke-test table deleted' : 'Smoke-test table did not exist',
    })
  } catch (error) {
    sendIntegrationError(response, error)
  }
})

export default router