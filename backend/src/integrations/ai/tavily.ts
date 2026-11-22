export type SearchSource = {
  title: string
  url: string
  content: string
}

export class TavilyConfigurationError extends Error {}

export class TavilyRateLimitError extends Error {
  constructor(readonly retryAfterSeconds?: number) {
    super('Tavily search quota or rate limit was reached (HTTP 429).')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function searchClaim(claim: string): Promise<SearchSource[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new TavilyConfigurationError('TAVILY_API_KEY is not configured on Railway')
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      api_key: apiKey,
      query: claim,
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
    }),
  })

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after')
      const retryAfterSeconds =
        retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined
      throw new TavilyRateLimitError(retryAfterSeconds)
    }

    throw new Error(`Tavily rejected the search request (HTTP ${response.status})`)
  }

  const payload: unknown = await response.json()
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new Error('Tavily returned an unexpected search response')
  }

  const sources: SearchSource[] = []
  const seen = new Set<string>()
  for (const result of payload.results) {
    if (
      !isRecord(result) ||
      typeof result.title !== 'string' ||
      typeof result.url !== 'string' ||
      typeof result.content !== 'string'
    ) {
      continue
    }

    let url: URL
    try {
      url = new URL(result.url)
    } catch {
      continue
    }
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      seen.has(url.toString())
    ) {
      continue
    }

    seen.add(url.toString())
    sources.push({
      title: result.title.trim().slice(0, 200),
      url: url.toString(),
      content: result.content.trim().slice(0, 2000),
    })
    if (sources.length === 5) {
      break
    }
  }

  return sources
}
