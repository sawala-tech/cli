// `sawala sebar inbound` — custom inbound-domain management as code.
//
// Drives the real commander program with fetch stubbed, so each test asserts the
// exact request the CLI would put on the wire: method, path, and body. The two
// things most worth pinning down are that every call goes to the CLI-only
// /cli/sebar/* surface, and that NO projectId appears in the path (the inbound
// domain is org-level; scope is token/org-derived).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeConfig, writeCredentials, SAWALA_BRAND } from '@sawala/auth'
import { createProgram } from '../src/cli'

const VALID_TOKEN = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const API_BASE = 'https://api.sawala.cloud'
const DOMAIN = `${API_BASE}/cli/sebar/settings/inbound-domain`
const EMAIL = `${API_BASE}/cli/sebar/settings/inbound-email`

const ENV_KEYS = [
  'SAWALA_API_TOKEN',
  'SAWALA_ORG',
  'SAWALA_PROJECT',
  'SAWALA_API_BASE',
  'SAWALA_CONFIG_DIR',
] as const

let tmpDir: string
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'sawala-sebar-'))
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  process.env['SAWALA_CONFIG_DIR'] = tmpDir
  await writeCredentials(SAWALA_BRAND, {
    token: VALID_TOKEN,
    apiBase: API_BASE,
    savedAt: '2026-07-17T00:00:00Z',
    scopeOrgId: null,
    scopeOrgSlug: null,
  })
  await writeConfig(SAWALA_BRAND, {
    activeOrg: 'finance-sawala',
    activeProject: 'default',
    activeProjectId: 'proj_01default',
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  })
  return { lines, restore: () => spy.mockRestore() }
}

const run = (...argv: string[]) => createProgram().parseAsync(['node', 'sawala', ...argv])

function lastCall(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [string, RequestInit]
}

const domainRow = {
  domain: 'inbox.acme.test',
  mxHost: 'inbound.postmarkapp.com',
  mxPriority: 10,
  verified: false,
  status: 'pending' as const,
  createdAt: '2026-07-18T00:00:00Z',
  verifiedAt: null,
}
const mxRecord = { type: 'MX' as const, name: 'inbox.acme.test', value: 'inbound.postmarkapp.com', priority: 10 }

describe('sawala sebar inbound domain', () => {
  it('show hits the CLI-only surface with NO projectId in the path', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ domain: null }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('sebar', 'inbound', 'domain', 'show')
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(DOMAIN)
    expect(url).not.toContain('proj_01default')
    expect((init.method ?? 'GET')).toBe('GET')
    expect(cap.lines.join('')).toContain('No inbound domain set')
  })

  it('sends the active org as a header for the gateway to resolve', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ domain: null }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('sebar', 'inbound', 'domain', 'show')
    cap.restore()

    const [, init] = lastCall(fetchMock)
    const headers = init.headers as Record<string, string>
    expect(headers['x-org-id']).toBe('finance-sawala')
    expect(headers['Authorization']).toBe(`Bearer ${VALID_TOKEN}`)
  })

  it('set POSTs { domain } and prints the MX record', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ domain: domainRow, mxRecord }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('sebar', 'inbound', 'domain', 'set', 'inbox.acme.test')
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(DOMAIN)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ domain: 'inbox.acme.test' })
    const out = cap.lines.join('')
    expect(out).toContain('MX')
    expect(out).toContain('inbound.postmarkapp.com')
    expect(out).toContain('10')
  })

  it('set --dry-run performs no write', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ domain: domainRow, mxRecord }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('sebar', 'inbound', 'domain', 'set', 'inbox.acme.test', '--dry-run')
    cap.restore()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(cap.lines.join(''))).toEqual({
      wouldSend: { method: 'POST', path: '/cli/sebar/settings/inbound-domain', body: { domain: 'inbox.acme.test' } },
    })
  })

  it('verify POSTs to /verify', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ domain: { ...domainRow, verified: true, status: 'verified' }, mxRecord }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('sebar', 'inbound', 'domain', 'verify')
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(`${DOMAIN}/verify`)
    expect(init.method).toBe('POST')
    expect(cap.lines.join('')).toContain('Verified: inbox.acme.test')
  })

  it('remove --yes DELETEs the domain', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('sebar', 'inbound', 'domain', 'remove', '--yes')
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(DOMAIN)
    expect(init.method).toBe('DELETE')
    expect(cap.lines.join('')).toContain('removed')
  })

  it('remove without --yes refuses when there is no TTY (no write)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(run('sebar', 'inbound', 'domain', 'remove')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sawala sebar inbound address', () => {
  it('list prints addresses', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        addresses: [
          { address: 'support@inbox.acme.test', projectId: '', enabled: true, forwardToAjena: false, forwardToEmail: null, createdAt: 'x' },
        ],
        hasServer: true,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('sebar', 'inbound', 'address', 'list')
    cap.restore()

    expect(lastCall(fetchMock)[0]).toBe(EMAIL)
    expect(cap.lines.join('')).toContain('support@inbox.acme.test')
  })

  it('add POSTs { address }', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ address: 'support@inbox.acme.test', projectId: '', enabled: true, forwardToAjena: false, forwardToEmail: null, createdAt: 'x' }, 201),
    )
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('sebar', 'inbound', 'address', 'add', 'support@inbox.acme.test')
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(EMAIL)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ address: 'support@inbox.acme.test' })
  })

  it('remove --yes DELETEs the URL-encoded address', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('sebar', 'inbound', 'address', 'remove', 'support@inbox.acme.test', '--yes')
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(`${EMAIL}/${encodeURIComponent('support@inbox.acme.test')}`)
    expect(init.method).toBe('DELETE')
  })
})
