import { useState } from 'react'
import {
  Activity,
  Check,
  CircleAlert,
  Database,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Plus,
  SearchCheck,
  Server,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'
import './App.css'

type TestId =
  | 'railway'
  | 'email'
  | 'supabase'
  | 'createTable'
  | 'deleteTable'
  | 'factCheck'
  | 'rateLimit'
type TestState = 'idle' | 'running' | 'success' | 'error'
type TestResult = { state: TestState; message: string }
type Readiness = {
  testerAuth: boolean
  email: boolean
  gemini: boolean
  supabaseDatabase: boolean
}
type FactCheck = {
  verdict: 'supported' | 'mixed' | 'unsupported' | 'unverified'
  confidence: number
  explanation: string
  sources: { title: string; url: string }[]
}

const initialResults: Record<TestId, TestResult> = {
  railway: { state: 'idle', message: '' },
  email: { state: 'idle', message: '' },
  supabase: { state: 'idle', message: '' },
  createTable: { state: 'idle', message: '' },
  deleteTable: { state: 'idle', message: '' },
  factCheck: { state: 'idle', message: '' },
  rateLimit: { state: 'idle', message: '' },
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const rateLimitTestMaxRequests = 75

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFactCheck(value: Record<string, unknown>): value is Record<string, unknown> & FactCheck {
  return (
    ['supported', 'mixed', 'unsupported', 'unverified'].includes(String(value.verdict)) &&
    typeof value.confidence === 'number' &&
    typeof value.explanation === 'string' &&
    Array.isArray(value.sources) &&
    value.sources.every(
      (source) =>
        isRecord(source) && typeof source.title === 'string' && typeof source.url === 'string',
    )
  )
}

function ResultMessage({ result }: { result: TestResult }) {
  if (!result.message) {
    return <p className="result-message muted">Ready to run</p>
  }

  const Icon =
    result.state === 'success' ? Check : result.state === 'error' ? CircleAlert : Activity

  return (
    <p className={`result-message ${result.state}`} aria-live="polite">
      <Icon size={15} aria-hidden="true" />
      {result.message}
    </p>
  )
}

function App() {
  const [testerToken, setTesterToken] = useState('')
  const [recipient, setRecipient] = useState('')
  const [claim, setClaim] = useState('')
  const [factCheck, setFactCheck] = useState<FactCheck | null>(null)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [results, setResults] = useState(initialResults)

  async function requestApi(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    body?: Record<string, string>,
    protectedRequest = true,
  ): Promise<Record<string, unknown>> {
    if (!apiBaseUrl) {
      throw new Error('VITE_API_URL is missing from this Vercel deployment')
    }

    const headers: Record<string, string> = {}
    if (protectedRequest) {
      headers.Authorization = `Bearer ${testerToken}`
    }
    if (body) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error(`Railway returned a non-JSON response (HTTP ${response.status})`)
    }

    if (!isRecord(payload)) {
      throw new Error(`Railway returned an unexpected response (HTTP ${response.status})`)
    }
    if (!response.ok) {
      throw new Error(
        typeof payload.error === 'string'
          ? payload.error
          : `Request failed (HTTP ${response.status})`,
      )
    }

    return payload
  }

  async function runTest(
    id: TestId,
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    options: {
      body?: Record<string, string>
      protectedRequest?: boolean
      successMessage?: string
    } = {},
  ): Promise<Record<string, unknown> | null> {
    setResults((current) => ({
      ...current,
      [id]: { state: 'running', message: 'Testing connection…' },
    }))

    try {
      const payload = await requestApi(
        path,
        method,
        options.body,
        options.protectedRequest ?? true,
      )
      const message =
        typeof payload.message === 'string'
          ? payload.message
          : options.successMessage ?? 'Connection test passed'

      setResults((current) => ({
        ...current,
        [id]: { state: 'success', message },
      }))
      return payload
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The connection test failed'
      setResults((current) => ({
        ...current,
        [id]: { state: 'error', message },
      }))
      return null
    }
  }

  async function checkRailway() {
    const payload = await runTest('railway', '/api/health', 'GET', {
      protectedRequest: false,
      successMessage: 'Vercel reached Railway successfully',
    })

    if (payload && isRecord(payload.readiness)) {
      const currentReadiness = payload.readiness
      setReadiness({
        testerAuth: currentReadiness.testerAuth === true,
        email: currentReadiness.email === true,
        gemini: currentReadiness.gemini === true,
        supabaseDatabase: currentReadiness.supabaseDatabase === true,
      })
    }
  }

  async function checkClaim() {
    setFactCheck(null)
    setResults((current) => ({
      ...current,
      factCheck: { state: 'running', message: 'Checking claim with Gemini…' },
    }))

    try {
      const payload = await requestApi(
        '/api/fact-checks',
        'POST',
        { claim: claim.trim() },
        false,
      )
      if (!isFactCheck(payload)) {
        throw new Error('Railway returned an unexpected fact-check response')
      }

      setFactCheck(payload)
      setResults((current) => ({
        ...current,
        factCheck: { state: 'success', message: 'Fact-check complete' },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The fact-check failed'
      setResults((current) => ({
        ...current,
        factCheck: { state: 'error', message },
      }))
    }
  }

  async function testRateLimit() {
    if (!apiBaseUrl) {
      setResults((current) => ({
        ...current,
        rateLimit: { state: 'error', message: 'VITE_API_URL is missing from this Vercel deployment' },
      }))
      return
    }

    setResults((current) => ({
      ...current,
      rateLimit: { state: 'running', message: 'Sending request 1…' },
    }))

    for (let requestCount = 1; requestCount <= rateLimitTestMaxRequests; requestCount += 1) {
      try {
        const response = await fetch(`${apiBaseUrl}/api/health`)

        if (response.status === 429) {
          setResults((current) => ({
            ...current,
            rateLimit: {
              state: 'success',
              message: `Rate limiting works: HTTP 429 received on request ${requestCount} (${requestCount} requests sent).`,
            },
          }))
          return
        }

        if (!response.ok) {
          setResults((current) => ({
            ...current,
            rateLimit: {
              state: 'error',
              message: `Unexpected HTTP ${response.status} on request ${requestCount}; unable to confirm rate limiting.`,
            },
          }))
          return
        }

        setResults((current) => ({
          ...current,
          rateLimit: {
            state: 'running',
            message: `Sending requests… ${requestCount}/${rateLimitTestMaxRequests}`,
          },
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The request failed'
        setResults((current) => ({
          ...current,
          rateLimit: {
            state: 'error',
            message: `Request ${requestCount} failed before a 429 response: ${message}`,
          },
        }))
        return
      }
    }

    setResults((current) => ({
      ...current,
      rateLimit: {
        state: 'error',
        message: `No rate limit detected: all ${rateLimitTestMaxRequests} requests succeeded without HTTP 429.`,
      },
    }))
  }

  async function sendTestEmail() {
    await runTest('email', '/api/test/email', 'POST', {
      body: { to: recipient.trim() },
    })
  }

  async function checkSupabase() {
    await runTest('supabase', '/api/test/supabase/connection', 'POST')
  }

  async function createTable() {
    await runTest('createTable', '/api/test/supabase/table', 'POST')
  }

  async function deleteTable() {
    const confirmed = window.confirm(
      'Delete only public.social_platform_connection_smoke_test? No other table will be touched.',
    )
    if (!confirmed) {
      return
    }

    await runTest('deleteTable', '/api/test/supabase/table', 'DELETE')
  }

  const testerConfigured = readiness?.testerAuth === true

  return (
    <div className="tester-page">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Social Platform Tester home">
          <span className="brand-icon">
            <Zap size={18} fill="currentColor" aria-hidden="true" />
          </span>
          <span>Social Platform</span>
          <span className="brand-divider">/</span>
          <span className="brand-section">Connection tester</span>
        </a>
        <span className="prototype-badge">
          <span className="badge-dot" />
          Prototype
        </span>
      </header>

      <main className="main-content">
        <section className="intro">
          <p className="eyebrow"><Activity size={14} /> INTEGRATION WORKSPACE</p>
          <h1>Everything connected?</h1>
          <p className="intro-copy">
            Run a safe end-to-end check across your Vercel frontend, Railway API, Brevo email,
            and Supabase database.
          </p>
        </section>

        <section className="auth-panel">
          <div className="auth-icon"><LockKeyhole size={18} /></div>
          <div className="auth-copy">
            <h2>Tester access</h2>
            <p>
              Enter the <code>TESTER_TOKEN</code> configured on Railway. It stays in this page’s
              memory and is sent only to your API.
            </p>
          </div>
          <div className="auth-input-wrap">
            <input
              className="text-input token-input"
              type="password"
              autoComplete="off"
              aria-label="Tester token"
              placeholder="Enter tester token"
              value={testerToken}
              onChange={(event) => setTesterToken(event.target.value)}
            />
            <span className={`token-state ${testerConfigured ? 'ready' : ''}`}>
              <span className="badge-dot" />
              {testerConfigured ? 'API configured' : 'Check API first'}
            </span>
          </div>
        </section>

        <section className="overview" aria-label="Connection status">
          <article className="overview-card">
            <div className="overview-icon violet"><Server size={18} /></div>
            <div>
              <span className="overview-label">RAILWAY API</span>
              <strong>{results.railway.state === 'success' ? 'Connected' : 'Not checked'}</strong>
            </div>
            <StatusDot state={results.railway.state} />
          </article>
          <article className="overview-card">
            <div className="overview-icon blue"><Mail size={18} /></div>
            <div>
              <span className="overview-label">BREVO EMAIL</span>
              <strong>{readiness?.email ? 'Configured' : 'Not checked'}</strong>
            </div>
            <StatusDot state={readiness?.email ? 'success' : 'idle'} />
          </article>
          <article className="overview-card">
            <div className="overview-icon violet"><SearchCheck size={18} /></div>
            <div>
              <span className="overview-label">GEMINI AI</span>
              <strong>{readiness?.gemini ? 'Configured' : 'Not checked'}</strong>
            </div>
            <StatusDot state={readiness?.gemini ? 'success' : 'idle'} />
          </article>
          <article className="overview-card">
            <div className="overview-icon green"><Database size={18} /></div>
            <div>
              <span className="overview-label">SUPABASE DATABASE</span>
              <strong>
                {results.supabase.state === 'success'
                  ? 'Connected'
                  : readiness?.supabaseDatabase
                    ? 'Configured'
                    : 'Not checked'}
              </strong>
            </div>
            <StatusDot
              state={
                results.supabase.state === 'success'
                  ? 'success'
                  : readiness?.supabaseDatabase
                    ? 'idle'
                    : 'error'
              }
            />
          </article>
        </section>

        <section className="test-card checker-card" aria-labelledby="fact-check-heading">
          <div className="card-heading">
            <div className="card-icon violet"><SearchCheck size={19} /></div>
            <div>
              <h2 id="fact-check-heading">Check a claim</h2>
              <p>Ask Gemini to evaluate a factual claim using Google Search grounding.</p>
            </div>
          </div>
          <label className="field-label" htmlFor="claim">Claim to check</label>
          <textarea
            id="claim"
            className="text-input claim-input"
            maxLength={1000}
            placeholder="Enter a factual claim…"
            value={claim}
            onChange={(event) => setClaim(event.target.value)}
          />
          <ResultMessage result={results.factCheck} />
          <button
            className="button button-primary"
            type="button"
            onClick={checkClaim}
            disabled={claim.trim().length < 10 || results.factCheck.state === 'running'}
          >
            {results.factCheck.state === 'running' ? <Spinner /> : <SearchCheck size={16} />}
            Check claim
          </button>
          {factCheck && (
            <div className="fact-check-result" aria-live="polite">
              <div className="fact-check-summary">
                <strong className={`verdict ${factCheck.verdict}`}>{factCheck.verdict}</strong>
                <span>{Math.round(factCheck.confidence * 100)}% confidence</span>
              </div>
              <p>{factCheck.explanation}</p>
              {factCheck.sources.length > 0 ? (
                <div className="source-list">
                  <strong>Grounded sources</strong>
                  <ul>
                    {factCheck.sources.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="source-note">Gemini did not return verifiable source links.</p>
              )}
              <p className="safe-note">
                AI-generated assessment; verify important claims with the linked sources.
              </p>
            </div>
          )}
        </section>

        <section className="tester-grid">
          <article className="test-card">
            <div className="card-heading">
              <div className="card-icon violet"><ShieldCheck size={19} /></div>
              <div>
                <h2>API rate limit</h2>
                <p>Send up to {rateLimitTestMaxRequests} lightweight health checks and stop on HTTP 429.</p>
              </div>
            </div>
            <div className="endpoint">
              <span className="endpoint-method">GET</span>
              <code>{apiBaseUrl || 'Set VITE_API_URL on Vercel'}/api/health</code>
            </div>
            <ResultMessage result={results.rateLimit} />
            <button
              className="button button-primary"
              type="button"
              onClick={testRateLimit}
              disabled={results.rateLimit.state === 'running'}
            >
              {results.rateLimit.state === 'running' ? <Spinner /> : <ShieldCheck size={16} />}
              Test rate limit
            </button>
            <p className="safe-note">
              Shares your IP’s API quota; other API requests may be rate limited until the window resets.
            </p>
          </article>

          <article className="test-card">
            <div className="card-heading">
              <div className="card-icon violet"><Server size={19} /></div>
              <div>
                <h2>Vercel → Railway</h2>
                <p>Verify the deployed frontend can reach your API.</p>
              </div>
            </div>
            <div className="endpoint">
              <span className="endpoint-method">GET</span>
              <code>{apiBaseUrl || 'Set VITE_API_URL on Vercel'}/api/health</code>
            </div>
            <ResultMessage result={results.railway} />
            <button
              className="button button-primary"
              type="button"
              onClick={checkRailway}
              disabled={results.railway.state === 'running'}
            >
              {results.railway.state === 'running' ? <Spinner /> : <Activity size={16} />}
              Check API connection
            </button>
          </article>

          <article className="test-card">
            <div className="card-heading">
              <div className="card-icon blue"><Mail size={19} /></div>
              <div>
                <h2>Send a test email</h2>
                <p>Send one message through Brevo from your verified sender.</p>
              </div>
            </div>
            <label className="field-label" htmlFor="recipient">Recipient email</label>
            <input
              id="recipient"
              className="text-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
            <ResultMessage result={results.email} />
            <button
              className="button button-primary"
              type="button"
              onClick={sendTestEmail}
              disabled={!testerConfigured || !testerToken || !recipient.trim() || results.email.state === 'running'}
            >
              {results.email.state === 'running' ? <Spinner /> : <Mail size={16} />}
              Send test email
            </button>
          </article>

          <article className="test-card database-card">
            <div className="card-heading">
              <div className="card-icon green"><Database size={19} /></div>
              <div>
                <h2>Supabase Postgres</h2>
                <p>Check the database connection and manage one dedicated smoke-test table.</p>
              </div>
            </div>
            <div className="table-name">
              <span>TEST TABLE</span>
              <code>public.social_platform_connection_smoke_test</code>
            </div>
            <ResultMessage result={results.supabase} />
            <div className="button-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={checkSupabase}
                disabled={!testerConfigured || !testerToken || results.supabase.state === 'running'}
              >
                {results.supabase.state === 'running' ? <Spinner /> : <Activity size={16} />}
                Check connection
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={createTable}
                disabled={!testerConfigured || !testerToken || results.createTable.state === 'running'}
              >
                {results.createTable.state === 'running' ? <Spinner /> : <Plus size={16} />}
                Create table
              </button>
            </div>
            <ResultMessage result={results.createTable} />
            <button
              className="button button-danger"
              type="button"
              onClick={deleteTable}
              disabled={!testerConfigured || !testerToken || results.deleteTable.state === 'running'}
            >
              {results.deleteTable.state === 'running' ? <Spinner /> : <Trash2 size={16} />}
              Delete smoke-test table
            </button>
            <ResultMessage result={results.deleteTable} />
            <p className="safe-note">
              <ShieldCheck size={15} />
              Delete is limited to this named smoke-test table and asks for confirmation.
            </p>
          </article>
        </section>

        <footer className="page-footer">
          <span>Credentials stay on Railway. Only test inputs are sent from this browser.</span>
          <span>Connection tester · v1</span>
        </footer>
      </main>
    </div>
  )
}

function StatusDot({ state }: { state: TestState }) {
  return <span className={`status-dot ${state}`} aria-label={state} />
}

function Spinner() {
  return <LoaderCircle className="spin" size={16} aria-hidden="true" />
}

export default App
