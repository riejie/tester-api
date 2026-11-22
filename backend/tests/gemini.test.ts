import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkClaim,
  GeminiRateLimitError,
} from '../src/integrations/ai/gemini.js'
import { TavilyRateLimitError } from '../src/integrations/ai/tavily.js'

test('fact-check uses Tavily evidence and validates the Gemini response', async () => {
  const originalApiKey = process.env.GEMINI_API_KEY
  const originalTavilyApiKey = process.env.TAVILY_API_KEY
  const originalFetch = globalThis.fetch
  let requestBody: Record<string, unknown> | undefined
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  process.env.TAVILY_API_KEY = 'test-tavily-key'
  globalThis.fetch = async (input, init) => {
    if (String(input) === 'https://api.tavily.com/search') {
      const tavilyRequest = JSON.parse(String(init?.body)) as Record<string, unknown>
      assert.equal(tavilyRequest.api_key, 'test-tavily-key')
      assert.equal(tavilyRequest.query, 'The Earth orbits the Sun.')
      return new Response(JSON.stringify({
        results: [{
          title: 'Source of evidence',
          url: 'https://example.com/evidence',
          content: 'Evidence supporting the claim.',
        }],
      }), { status: 200 })
    }

    assert.match(String(input), /models\/gemini-3\.5-flash-lite:generateContent$/)
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
    assert.equal(requestBody?.tools, undefined)
    assert.deepEqual(requestBody?.generationConfig, { responseMimeType: 'application/json' })
    assert.match(JSON.stringify(requestBody), /Evidence supporting the claim\./)
  } finally {
    globalThis.fetch = originalFetch
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = originalApiKey
    }
    if (originalTavilyApiKey === undefined) {
      delete process.env.TAVILY_API_KEY
    } else {
      process.env.TAVILY_API_KEY = originalTavilyApiKey
    }
  }
})

test('Gemini quota errors explain the likely cause and preserve the retry delay', async () => {
  const originalApiKey = process.env.GEMINI_API_KEY
  const originalTavilyApiKey = process.env.TAVILY_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  process.env.TAVILY_API_KEY = 'test-tavily-key'
  globalThis.fetch = async (input) => {
    if (String(input) === 'https://api.tavily.com/search') {
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }
    return new Response(JSON.stringify({
      error: { code: 429, message: 'Resource exhausted' },
    }), { status: 429, headers: { 'retry-after': '30' } })
  }

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
    if (originalTavilyApiKey === undefined) {
      delete process.env.TAVILY_API_KEY
    } else {
      process.env.TAVILY_API_KEY = originalTavilyApiKey
    }
  }
})

test('Tavily quota errors preserve the retry delay', async () => {
  const originalTavilyApiKey = process.env.TAVILY_API_KEY
  const originalFetch = globalThis.fetch
  process.env.TAVILY_API_KEY = 'test-tavily-key'
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'rate limited' }), {
      status: 429,
      headers: { 'retry-after': '15' },
    })

  try {
    await assert.rejects(
      checkClaim('The Earth orbits the Sun.'),
      (error: unknown) => {
        assert.ok(error instanceof TavilyRateLimitError)
        assert.equal(error.retryAfterSeconds, 15)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalTavilyApiKey === undefined) {
      delete process.env.TAVILY_API_KEY
    } else {
      process.env.TAVILY_API_KEY = originalTavilyApiKey
    }
  }
})
