import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import app from '../src/app.js'

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
      'supabaseDatabase',
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
