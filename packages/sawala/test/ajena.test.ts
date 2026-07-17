// `sawala ajena flow` — FLOW as code (PLAN-ajena-flow-billing-followups, M4e).
//
// Drives the real commander program with fetch stubbed, so each test asserts the
// exact request the CLI would put on the wire: method, path, and body. The two
// things most worth pinning down here are the ones a reader can't see from the
// command definitions — that every call goes to the CLI-only /cli/ajena/*
// surface, and that NO projectId appears in the path (Ajena derives scope from
// the token, unlike the Kontena/Datana commands whose URLs carry it).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeConfig, writeCredentials, SAWALA_BRAND } from '@sawala/auth'
import { createProgram } from '../src/cli'

const VALID_TOKEN = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const API_BASE = 'https://api.sawala.cloud'
const FLOWS = `${API_BASE}/cli/ajena/api/admin/flows`
const FLOW_RUNS = `${API_BASE}/cli/ajena/api/admin/flow-runs`
const FLOW_ID = 'b6d1e2f0-0000-4000-8000-000000000001'

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
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'sawala-ajena-'))
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

function captureStderr(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    lines.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  })
  return { lines, restore: () => spy.mockRestore() }
}

const run = (...argv: string[]) => createProgram().parseAsync(['node', 'sawala', ...argv])

// A minimal FlowDocument, shaped like what `pull` writes.
const doc = {
  schemaVersion: 1,
  flowId: FLOW_ID,
  name: 'AWS billing',
  description: '',
  enabled: true,
  trigger: { type: 'channel_inbound', channel: 'email', match: { type: 'always' } },
  steps: [
    { id: 's1', kind: 'extract_document', name: 'read', dependsOn: [], config: { assetId: '{{trigger.assetId}}', passwordCount: 2, hasPassword: true } },
  ],
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [string, RequestInit]
}

describe('sawala ajena flow list', () => {
  it('calls the CLI-only surface with NO projectId in the path (scope is token-derived)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ flows: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'list')
    cap.restore()

    const [url] = lastCall(fetchMock)
    expect(url).toBe(FLOWS)
    expect(url).not.toContain('proj_01default')
    expect(cap.lines.join('')).toContain('No flows')
  })

  it('sends the active org + project as headers for the gateway to resolve', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ flows: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'list')
    cap.restore()

    const [, init] = lastCall(fetchMock)
    const headers = init.headers as Record<string, string>
    expect(headers['x-org-id']).toBe('finance-sawala')
    expect(headers['x-project-id']).toBe('default')
    expect(headers['Authorization']).toBe(`Bearer ${VALID_TOKEN}`)
  })

  it('formats id / state / trigger / name', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ flows: [doc] }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'list')
    cap.restore()

    const out = cap.lines.join('')
    expect(out).toContain(FLOW_ID)
    expect(out).toContain('enabled')
    expect(out).toContain('email inbound')
    expect(out).toContain('AWS billing')
  })

  it('`ajena list` is a shortcut for `ajena flow list`', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ flows: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const c1 = captureStdout()
    await run('ajena', 'list')
    c1.restore()
    expect(lastCall(fetchMock)[0]).toBe(FLOWS)
  })
})

describe('sawala ajena flow pull / get', () => {
  it('get pretty-prints the FlowDocument', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(doc))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'get', FLOW_ID)
    cap.restore()

    expect(lastCall(fetchMock)[0]).toBe(`${FLOWS}/${FLOW_ID}`)
    expect(JSON.parse(cap.lines.join(''))).toEqual(doc)
  })

  it('pull -o writes the document to a file and keeps stdout clean for scripts', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(doc))
    vi.stubGlobal('fetch', fetchMock)
    const out = join(tmpDir, 'flow.json')

    const capOut = captureStdout()
    const capErr = captureStderr()
    await run('ajena', 'flow', 'pull', FLOW_ID, '-o', out)
    capOut.restore()
    capErr.restore()

    expect(JSON.parse(await fs.readFile(out, 'utf8'))).toEqual(doc)
    expect(capOut.lines.join('')).toBe('')
    expect(capErr.lines.join('')).toContain('Wrote')
  })

  it('pull without -o writes to stdout', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(doc))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'pull', FLOW_ID)
    cap.restore()
    expect(JSON.parse(cap.lines.join(''))).toEqual(doc)
  })

  // The losslessness contract: a pulled document carries no ciphertext, only the
  // read-only passwordCount/hasPassword. Pushing it back unchanged must preserve
  // the stored passwords — which works precisely BECAUSE the password fields are
  // absent (the server reads absent as "keep"). If pull ever started emitting a
  // `passwords` key, a round-trip would silently rewrite secrets.
  it('a pulled document carries no secret material', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(doc))
    vi.stubGlobal('fetch', fetchMock)
    const out = join(tmpDir, 'flow.json')
    const capErr = captureStderr()
    await run('ajena', 'flow', 'pull', FLOW_ID, '-o', out)
    capErr.restore()

    const text = await fs.readFile(out, 'utf8')
    expect(text).not.toContain('passwordSecret')
    expect(text).not.toContain('ciphertext')
    expect(text).not.toContain('"passwords"')
    expect(JSON.parse(text).steps[0].config.hasPassword).toBe(true)
  })

  // A per-step `enabled: false` (the disable toggle) must round-trip: pull writes
  // it to disk, and push sends the document back with the flag intact, so an
  // operator can turn one step off without editing the rest of the flow.
  it('preserves a disabled step (enabled:false) through pull → push', async () => {
    const disabledDoc = {
      ...doc,
      steps: [
        { id: 's1', kind: 'transform', name: 'read', dependsOn: [], config: {} },
        { id: 's2', kind: 'sebar_send', name: 'email', dependsOn: ['s1'], config: { to: 'a@b.com' }, enabled: false },
      ],
    }
    const fetchMock = vi.fn(async () => jsonResponse(disabledDoc))
    vi.stubGlobal('fetch', fetchMock)
    const out = join(tmpDir, 'flow.json')

    const capErr = captureStderr()
    await run('ajena', 'flow', 'pull', FLOW_ID, '-o', out)
    capErr.restore()
    expect(JSON.parse(await fs.readFile(out, 'utf8')).steps[1].enabled).toBe(false)

    // Push the pulled file back; the PUT body must still carry enabled:false.
    const capOut = captureStdout()
    await run('ajena', 'flow', 'push', FLOW_ID, '-f', out)
    capOut.restore()
    const [, init] = lastCall(fetchMock)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string).steps[1].enabled).toBe(false)
  })
})

describe('sawala ajena flow push', () => {
  it('PUTs the document to /flows/<id>', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(doc))
    vi.stubGlobal('fetch', fetchMock)
    const file = join(tmpDir, 'flow.json')
    await fs.writeFile(file, JSON.stringify(doc))

    const cap = captureStdout()
    await run('ajena', 'flow', 'push', FLOW_ID, '-f', file)
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(`${FLOWS}/${FLOW_ID}`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual(doc)
  })

  it('--dry-run prints what would be sent and writes nothing', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(doc))
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await run('ajena', 'flow', 'push', FLOW_ID, '-d', JSON.stringify(doc), '--dry-run')
    cap.restore()

    expect(fetchMock).not.toHaveBeenCalled()
    const printed = JSON.parse(cap.lines.join('')) as { wouldSend: { method: string; path: string } }
    expect(printed.wouldSend.method).toBe('PUT')
    expect(printed.wouldSend.path).toContain(`/flows/${FLOW_ID}`)
  })

  it('--check validates first and REFUSES to push when invalid', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ valid: false, errors: [{ stepId: 's3', path: 'functionPath', message: "must start with '/'" }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const capErr = captureStderr()
    await expect(run('ajena', 'flow', 'push', FLOW_ID, '-d', JSON.stringify(doc), '--check')).rejects.toThrow(
      /Refusing to push/,
    )
    capErr.restore()

    // Exactly one call — the validate. The PUT never happened.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastCall(fetchMock)[0]).toBe(`${FLOWS}/validate`)
    expect(capErr.lines.join('')).toContain('step s3 functionPath')
  })

  it('--check proceeds to the PUT when valid', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ valid: true, errors: [] }))
      .mockResolvedValueOnce(jsonResponse(doc))
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await run('ajena', 'flow', 'push', FLOW_ID, '-d', JSON.stringify(doc), '--check')
    cap.restore()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(`${FLOWS}/${FLOW_ID}`)
    expect(init.method).toBe('PUT')
  })
})

describe('sawala ajena flow create / delete', () => {
  it('create POSTs to /flows', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(doc, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'create', '-d', JSON.stringify(doc))
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(FLOWS)
    expect(init.method).toBe('POST')
  })

  it('delete --yes DELETEs without prompting', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'delete', FLOW_ID, '--yes')
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(`${FLOWS}/${FLOW_ID}`)
    expect(init.method).toBe('DELETE')
  })

  it('delete without --yes refuses when there is no TTY (scripted callers must opt in)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    // vitest runs without a TTY, so confirmOrThrow fails closed.
    await expect(run('ajena', 'flow', 'delete', FLOW_ID)).rejects.toThrow(/--yes/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sawala ajena flow validate', () => {
  it('POSTs to /flows/validate and reports Valid', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ valid: true, errors: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'validate', '-d', JSON.stringify(doc))
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(`${FLOWS}/validate`)
    expect(init.method).toBe('POST')
    expect(cap.lines.join('')).toContain('Valid.')
  })

  // Non-zero exit is what makes this usable as a CI / pre-commit gate.
  it('exits non-zero and names each problem when invalid', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        valid: false,
        errors: [
          { stepId: 's3', path: 'collection', message: 'is required' },
          { stepId: '', path: '', message: "unknown trigger type 'banana'" },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const capErr = captureStderr()
    await expect(run('ajena', 'flow', 'validate', '-d', JSON.stringify(doc))).rejects.toThrow(
      /Invalid FlowDocument: 2 error/,
    )
    capErr.restore()

    const err = capErr.lines.join('')
    expect(err).toContain('step s3 collection: is required')
    // A graph-level error has no step — label it "flow", never a blank line.
    expect(err).toContain("flow: unknown trigger type 'banana'")
  })
})

describe('sawala ajena flow run / runs', () => {
  it('run POSTs to /flows/<id>/run with a null input by default', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ runId: 'run_1' }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'run', FLOW_ID)
    cap.restore()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe(`${FLOWS}/${FLOW_ID}/run`)
    expect(JSON.parse(init.body as string)).toEqual({ input: null })
  })

  it('run -d passes the trigger input through', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ runId: 'run_1' }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'run', FLOW_ID, '-d', '{"subject":"May"}')
    cap.restore()

    expect(JSON.parse(lastCall(fetchMock)[1].body as string)).toEqual({ input: { subject: 'May' } })
  })

  it('runs --flow/--status filter via the query string', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ runs: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'runs', '--flow', FLOW_ID, '--status', 'failed')
    cap.restore()

    const [url] = lastCall(fetchMock)
    expect(url).toBe(`${FLOW_RUNS}?flowId=${FLOW_ID}&status=failed`)
  })

  it('run-get fetches the trace', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ runId: 'run_1', trace: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await run('ajena', 'flow', 'run-get', 'run_1')
    cap.restore()

    expect(lastCall(fetchMock)[0]).toBe(`${FLOW_RUNS}/run_1`)
  })
})
