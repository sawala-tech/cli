import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserLogin } from '../src/browser-login'

// Drive the full loopback flow without a real browser: stub only the
// `/cli-auth/exchange` POST and let every other fetch (the test's own callback
// hit) pass through to the real implementation.
const realFetch = globalThis.fetch

function stubExchange(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/cli-auth/exchange')) {
        return new Response(
          JSON.stringify({
            token: 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
            apiBase: 'https://api.sawala.cloud',
            scopeOrgId: null,
            scopeOrgSlug: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return realFetch(input, init)
    },
  )
}

afterEach(() => vi.restoreAllMocks())

// Run a full browser login for `brand`, returning the authorize URL the helper
// built (so we can assert what the dashboard page receives) and the result.
async function login(brand: 'kodena' | 'sawala') {
  stubExchange()
  let authorizeUrl = ''
  const result = await browserLogin({
    apiBase: 'https://api.sawala.cloud',
    webBase: 'https://sawala.cloud',
    brand,
    label: `${brand} CLI · test-host`,
    onUrl: (url) => {
      authorizeUrl = url
      // Simulate the dashboard redirecting the browser back to the loopback
      // callback with a matching state + a single-use code.
      const u = new URL(url)
      const cb = new URL(u.searchParams.get('redirect_uri')!)
      cb.searchParams.set('state', u.searchParams.get('state')!)
      cb.searchParams.set('code', 'test-code')
      void realFetch(cb.toString())
    },
  })
  return { authorizeUrl, result }
}

describe('browserLogin', () => {
  it('passes brand=sawala to the authorize page', async () => {
    const { authorizeUrl, result } = await login('sawala')
    const params = new URL(authorizeUrl).searchParams
    expect(authorizeUrl.startsWith('https://sawala.cloud/cli-login?')).toBe(true)
    expect(params.get('brand')).toBe('sawala')
    expect(params.get('label')).toBe('sawala CLI · test-host')
    expect(params.get('state')).toBeTruthy()
    expect(result.token).toBe('koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')
  })

  it('passes brand=kodena to the authorize page', async () => {
    const { authorizeUrl } = await login('kodena')
    expect(new URL(authorizeUrl).searchParams.get('brand')).toBe('kodena')
  })
})
