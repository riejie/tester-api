import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import app, { createApp } from '../src/app.js'

const server = app.listen(0)
let baseUrl: string

before(async () => {
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  server.close()
  await once(server, 'close')
})

test('health endpoint reports service readiness and deployment commit', async () => {
  const originalCommit = process.env.RAILWAY_GIT_COMMIT_SHA
  process.env.RAILWAY_GIT_COMMIT_SHA = 'test-commit'

  try {
    const response = await fetch(`${baseUrl}/api/health`)
    const payload = await response.json() as {
      ok: boolean
      service: string
      version: string | null
      readiness: Record<string, boolean>
    }

    assert.equal(response.status, 200)
    assert.equal(payload.ok, true)
    assert.equal(payload.service, 'social-platform-api')
    assert.equal(payload.version, 'test-commit')
    assert.deepEqual(Object.keys(payload.readiness).sort(), [
      'email',
      'gemini',
      'supabaseDatabase',
      'tavily',
      'testerAuth',
    ])
  } finally {
    if (originalCommit === undefined) {
      delete process.env.RAILWAY_GIT_COMMIT_SHA
    } else {
      process.env.RAILWAY_GIT_COMMIT_SHA = originalCommit
    }
  }
})

test('fact-check endpoint validates claims and reports missing Tavily configuration', async () => {
  const originalApiKey = process.env.GEMINI_API_KEY
  const originalTavilyApiKey = process.env.TAVILY_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.TAVILY_API_KEY

  try {
    const invalidResponse = await fetch(`${baseUrl}/api/fact-checks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claim: 'short' }),
    })
    assert.equal(invalidResponse.status, 400)

    const response = await fetch(`${baseUrl}/api/fact-checks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claim: 'The Earth orbits the Sun.' }),
    })

    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), {
      error: 'TAVILY_API_KEY is not configured on Railway',
    })
  } finally {
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

test('fact-check endpoint returns Gemini quota errors as 429 with retry guidance', async () => {
  const originalApiKey = process.env.GEMINI_API_KEY
  const originalTavilyApiKey = process.env.TAVILY_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GEMINI_API_KEY = 'ci-only-test-key'
  process.env.TAVILY_API_KEY = 'ci-only-tavily-key'
  globalThis.fetch = async (input, init) => {
    if (String(input) === 'https://api.tavily.com/search') {
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }
    if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
      return new Response(JSON.stringify({
        error: { code: 429, message: 'Resource exhausted' },
      }), {
        status: 429,
        headers: { 'retry-after': '30' },
      })

      test('fact-check endpoint returns Tavily quota errors as 429 with retry guidance', async () => {
        const originalGeminiApiKey = process.env.GEMINI_API_KEY
        const originalTavilyApiKey = process.env.TAVILY_API_KEY
        const originalFetch = globalThis.fetch
        process.env.GEMINI_API_KEY = 'ci-only-gemini-key'
        process.env.TAVILY_API_KEY = 'ci-only-tavily-key'
        globalThis.fetch = async (input, init) => {
          if (String(input) === 'https://api.tavily.com/search') {
            return new Response(JSON.stringify({ error: 'rate limited' }), {
              status: 429,
              headers: { 'retry-after': '15' },
            })
          }
          return originalFetch(input, init)
        }

        try {
          const response = await originalFetch(`${baseUrl}/api/fact-checks`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ claim: 'The Earth orbits the Sun.' }),
          })

          assert.equal(response.status, 429)
          assert.equal(response.headers.get('retry-after'), '15')
          assert.deepEqual(await response.json(), {
            error: 'Tavily search quota or rate limit was reached (HTTP 429).',
          })
        } finally {
          globalThis.fetch = originalFetch
          if (originalGeminiApiKey === undefined) {
            delete process.env.GEMINI_API_KEY
          } else {
            process.env.GEMINI_API_KEY = originalGeminiApiKey
          }
          if (originalTavilyApiKey === undefined) {
            delete process.env.TAVILY_API_KEY
          } else {
            process.env.TAVILY_API_KEY = originalTavilyApiKey
          }
        }
      })
    }

    return originalFetch(input, init)
  }

  try {
    const response = await originalFetch(`${baseUrl}/api/fact-checks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claim: 'The Earth orbits the Sun.' }),
    })

    assert.equal(response.status, 429)
    assert.equal(response.headers.get('retry-after'), '30')
    assert.deepEqual(await response.json(), {
      error: 'Gemini quota or rate limit was reached (HTTP 429). Check Google AI Studio quota and billing for the API-key project.',
    })
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

test('rate limiter returns HTTP 429 after the configured request limit', async () => {
  const limitedServer = createApp({ rateLimitMax: 2 }).listen(0)
  await once(limitedServer, 'listening')
  const address = limitedServer.address()
  assert.ok(address && typeof address !== 'string')
  const limitedBaseUrl = `http://127.0.0.1:${address.port}`

  try {
    assert.equal((await fetch(`${limitedBaseUrl}/api/health`)).status, 200)
    assert.equal((await fetch(`${limitedBaseUrl}/api/health`)).status, 200)

    const limitedResponse = await fetch(`${limitedBaseUrl}/api/health`)
    assert.equal(limitedResponse.status, 429)
    assert.deepEqual(await limitedResponse.json(), {
      error: 'Too many requests, please try again later',
    })
  } finally {
    limitedServer.close()
    await once(limitedServer, 'close')
  }
})

test('integration endpoints reject missing and invalid tester tokens', async () => {
  const originalToken = process.env.TESTER_TOKEN
  process.env.TESTER_TOKEN = 'ci-only-test-token'

  try {
    for (const authorization of [undefined, 'Bearer wrong-token']) {
      const response = await fetch(`${baseUrl}/api/test/supabase/connection`, {
        method: 'POST',
        headers: authorization ? { authorization } : {},
      })

      assert.equal(response.status, 401)
    }
  } finally {
    if (originalToken === undefined) {
      delete process.env.TESTER_TOKEN
    } else {
      process.env.TESTER_TOKEN = originalToken
    }
  }
})

test('email endpoint rejects invalid addresses before contacting the provider', async () => {
  const originalToken = process.env.TESTER_TOKEN
  process.env.TESTER_TOKEN = 'ci-only-test-token'

  try {
    const response = await fetch(`${baseUrl}/api/test/email`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ci-only-test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: 'not-an-email' }),
    })

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      error: 'Enter a valid recipient email address',
    })
  } finally {
    if (originalToken === undefined) {
      delete process.env.TESTER_TOKEN
    } else {
      process.env.TESTER_TOKEN = originalToken
    }
  }
})
