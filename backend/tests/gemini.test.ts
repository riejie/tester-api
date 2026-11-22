import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkClaim,
  GeminiRateLimitError,
} from '../src/integrations/ai/gemini.js'

test('Gemini fact-check uses grounded sources and validates the model response', async () => {
  const originalApiKey = process.env.GEMINI_API_KEY
  const originalFetch = globalThis.fetch
  let requestBody: Record<string, unknown> | undefined
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /models\/gemini-2\.5-flash:generateContent$/)
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'test-gemini-key')
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>

    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              verdict: 'supported',
              confidence: 0.96,
              explanation: 'Reliable sources support the claim.',
            }),
          }],
        },
        groundingMetadata: {
          groundingChunks: [{
            web: { title: 'Source of evidence', uri: 'https://example.com/evidence' },
          }],
        },
      }],
    }), { status: 200 })
  }

  try {
    const result = await checkClaim('The Earth orbits the Sun.')

    assert.equal(result.verdict, 'supported')
    assert.equal(result.confidence, 0.96)
    assert.deepEqual(result.sources, [{
      title: 'Source of evidence',
      url: 'https://example.com/evidence',
    }])
    assert.ok(Array.isArray(requestBody?.tools))
  } finally {
    globalThis.fetch = originalFetch
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = originalApiKey
    }
  }
})

test('Gemini quota errors explain the likely cause and preserve the retry delay', async () => {
  const originalApiKey = process.env.GEMINI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  globalThis.fetch = async () =>
    new Response(JSON.stringify({
      error: { code: 429, message: 'Resource exhausted' },
    }), {
      status: 429,
      headers: { 'retry-after': '30' },
    })

  try {
    await assert.rejects(
      checkClaim('The Earth orbits the Sun.'),
      (error: unknown) => {
        assert.ok(error instanceof GeminiRateLimitError)
        assert.equal(error.retryAfterSeconds, 30)
        assert.match(error.message, /quota or rate limit/)
        assert.match(error.message, /Google AI Studio quota and billing/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = originalApiKey
    }
  }
})
