import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { platform } from 'node:os'

/**
 * Browser login for Sawala CLIs (PLAN-kodena-cli-login).
 *
 * Runs an RFC 8252-style loopback authorization-code flow so the freshly-minted
 * token reaches the CLI over a direct HTTPS back-channel and NEVER traverses the
 * browser:
 *
 *   1. Generate a random `state` (CSRF guard).
 *   2. Bind a loopback HTTP server on 127.0.0.1 (a small port range).
 *   3. Open the dashboard `/cli-login` authorize page with state + redirect_uri.
 *   4. Await the browser's redirect to `127.0.0.1:<port>/callback?state&code`.
 *   5. Verify `state`, then swap the one-time `code` for the token directly with
 *      the API over HTTPS (`POST /cli-auth/exchange`).
 *
 * The browser only ever carries the single-use `code`; the token is returned to
 * the caller for it to persist via `writeCredentials`.
 */

export interface BrowserLoginResult {
  token: string
  apiBase: string
  scopeOrgId: string | null
  scopeOrgSlug: string | null
}

export interface BrowserLoginOptions {
  /** API base, e.g. https://api.sawala.cloud — where `/cli-auth/exchange` lives. */
  apiBase: string
  /** Dashboard base, e.g. https://sawala.cloud — where `/cli-login` lives. */
  webBase: string
  /** Human label for the token, e.g. `kodena CLI · my-host`. */
  label: string
  /** How long to wait for the browser callback before giving up. Default 5 min. */
  timeoutMs?: number
  /** Called with the authorize URL so the caller can print it for manual paste. */
  onUrl?: (url: string) => void
}

const PORT_START = 8976
const PORT_END = 8999
const DEFAULT_TIMEOUT_MS = 300_000

export async function browserLogin(opts: BrowserLoginOptions): Promise<BrowserLoginResult> {
  const state = randomBytes(32).toString('base64url')
  const { server, port } = await listenOnLoopback()

  try {
    const redirectUri = `http://127.0.0.1:${port}/callback`
    const authorizeUrl =
      `${opts.webBase.replace(/\/$/, '')}/cli-login` +
      `?state=${encodeURIComponent(state)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&label=${encodeURIComponent(opts.label)}`

    opts.onUrl?.(authorizeUrl)
    openInBrowser(authorizeUrl)

    const { code, error } = await waitForCallback(
      server,
      state,
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
    if (error) throw new Error(`Authorization was denied (${error}).`)
    if (!code) throw new Error('No authorization code was returned.')

    const res = await fetch(`${opts.apiBase.replace(/\/$/, '')}/cli-auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!res.ok) {
      throw new Error(`Token exchange failed (HTTP ${res.status}).`)
    }
    const data = (await res.json()) as Partial<BrowserLoginResult>
    if (!data.token) throw new Error('Exchange response did not include a token.')

    return {
      token: data.token,
      apiBase: data.apiBase ?? opts.apiBase,
      scopeOrgId: data.scopeOrgId ?? null,
      scopeOrgSlug: data.scopeOrgSlug ?? null,
    }
  } finally {
    server.close()
  }
}

// ── Internals ───────────────────────────────────────────────────────────────

async function listenOnLoopback(): Promise<{ server: Server; port: number }> {
  for (let port = PORT_START; port <= PORT_END; port++) {
    const server = createServer()
    if (await tryListen(server, port)) return { server, port }
  }
  throw new Error(`Could not bind a loopback port in range ${PORT_START}-${PORT_END}.`)
}

function tryListen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const onError = () => {
      server.removeListener('listening', onListening)
      resolve(false)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve(true)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

function waitForCallback(
  server: Server,
  expectedState: string,
  timeoutMs: number,
): Promise<{ code: string | undefined; error: string | undefined }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for browser authorization.'))
    }, timeoutMs)

    const onRequest = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      const state = url.searchParams.get('state')
      const code = url.searchParams.get('code') ?? undefined
      const error = url.searchParams.get('error') ?? undefined

      if (state !== expectedState) {
        res.statusCode = 400
        res.setHeader('content-type', 'text/html')
        res.end(page('Authorization failed', 'State mismatch — please re-run the login command.'))
        cleanup()
        reject(new Error('State mismatch on the loopback callback (possible CSRF).'))
        return
      }

      res.statusCode = 200
      res.setHeader('content-type', 'text/html')
      res.end(
        error
          ? page('Authorization cancelled', 'You can close this tab and return to the terminal.')
          : page('✓ Authorized', 'You can close this tab and return to the terminal.'),
      )
      cleanup()
      resolve({ code, error })
    }

    const cleanup = () => {
      clearTimeout(timer)
      server.removeListener('request', onRequest)
    }

    server.on('request', onRequest)
  })
}

function openInBrowser(url: string): void {
  const opener = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    // Non-fatal: the caller also prints the URL for manual paste.
  }
}

function page(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
    `<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;` +
    `align-items:center;justify-content:center;margin:0">` +
    `<div style="text-align:center"><h1 style="font-size:1.25rem">${title}</h1>` +
    `<p style="color:#555">${body}</p></div></body>`
}
