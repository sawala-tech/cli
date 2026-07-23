import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeConfig, writeCredentials, SAWALA_BRAND } from '@sawala/auth'
import { createProgram } from '../src/cli'

const VALID_TOKEN = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PROJECT_ID = 'proj_01abc'
const PROJECT_SLUG = 'blog'
const API_BASE = 'https://api.sawala.cloud'
const PROJECT = `${API_BASE}/cli/tugasna/projects/${PROJECT_ID}`
const BOARDS = `${PROJECT}/boards`

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
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'sawala-tugasna-'))
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  process.env['SAWALA_CONFIG_DIR'] = tmpDir
  await writeCredentials(SAWALA_BRAND, {
    token: VALID_TOKEN,
    apiBase: API_BASE,
    savedAt: '2026-06-17T00:00:00Z',
    scopeOrgId: null,
    scopeOrgSlug: null,
  })
  await writeConfig(SAWALA_BRAND, {
    activeOrg: 'acme',
    activeProject: PROJECT_SLUG,
    activeProjectId: PROJECT_ID,
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  })
  return { lines, restore: () => spy.mockRestore() }
}

describe('sawala tugasna board list / get', () => {
  it('list GETs /boards and prints a terse column per board', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([{ id: 'brd_1', slug: 'sprint', name: 'Sprint Board' }]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'tugasna', 'board', 'list'])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(BOARDS)
    const out = cap.lines.join('')
    expect(out).toContain('brd_1')
    expect(out).toContain('sprint')
    expect(out).toContain('Sprint Board')
  })

  it('list --archived sets ?archived=true', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'tugasna', 'board', 'list', '--archived'])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BOARDS}?archived=true`)
  })

  it('get fetches /boards/<boardId>', async () => {
    const board = { id: 'brd_1', slug: 'sprint', name: 'Sprint', statuses: [] }
    const fetchMock = vi.fn(async () => jsonResponse(board))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'tugasna', 'board', 'get', 'brd_1'])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BOARDS}/brd_1`)
    expect(JSON.parse(cap.lines.join(''))).toEqual(board)
  })
})

describe('sawala tugasna board create / update / archive', () => {
  it('create POSTs the --data body to /boards', async () => {
    const body = { name: 'Sprint Board', color: '#f00' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'brd_1', ...body }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'board', 'create', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(BOARDS)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('create --dry-run prints the request without calling fetch', async () => {
    const body = { name: 'Sprint Board' }
    const fetchMock = vi.fn(async () => jsonResponse({}, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'board', 'create', '--data', JSON.stringify(body), '--dry-run',
    ])
    cap.restore()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(cap.lines.join('')).wouldSend).toEqual({ method: 'POST', body })
  })

  it('update PATCHes /boards/<boardId>', async () => {
    const body = { name: 'Renamed' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'brd_1', ...body }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'board', 'update', 'brd_1', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BOARDS}/brd_1`)
    expect(init.method).toBe('PATCH')
  })

  it('archive POSTs /boards/<boardId>/archive', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ archived: true }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'tugasna', 'board', 'archive', 'brd_1'])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BOARDS}/brd_1/archive`)
    expect(init.method).toBe('POST')
  })
})

describe('sawala tugasna board status', () => {
  it('status create POSTs /boards/<boardId>/statuses', async () => {
    const body = { name: 'In Review', color: '#0f0' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'sta_1', ...body }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'board', 'status', 'create', 'brd_1', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BOARDS}/brd_1/statuses`)
    expect(init.method).toBe('POST')
  })

  it('status reorder POSTs /boards/<boardId>/statuses/reorder', async () => {
    const body = { statusIds: ['sta_2', 'sta_1'] }
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'board', 'status', 'reorder', 'brd_1', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BOARDS}/brd_1/statuses/reorder`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })
})

describe('sawala tugasna item', () => {
  it('list GETs /boards/<boardId>/items with optional filters', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ id: 'itm_1', title: 'Do the thing', statusId: 'sta_1' }]))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'item', 'list', 'brd_1', '--status', 'sta_1',
    ])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe(`/cli/tugasna/projects/${PROJECT_ID}/boards/brd_1/items`)
    expect(parsed.searchParams.get('status')).toBe('sta_1')
    expect(cap.lines.join('')).toContain('Do the thing')
  })

  it('create POSTs the body to /boards/<boardId>/items', async () => {
    const body = { title: 'New task', statusId: 'sta_1' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'itm_1', ...body }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'item', 'create', 'brd_1', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BOARDS}/brd_1/items`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('move POSTs /boards/<boardId>/items/<itemId>/move', async () => {
    const body = { statusId: 'sta_2', position: 0 }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'itm_1' }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'item', 'move', 'brd_1', 'itm_1', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BOARDS}/brd_1/items/itm_1/move`)
    expect(init.method).toBe('POST')
  })

  it('delete with --yes DELETEs /boards/<boardId>/items/<itemId>', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'item', 'delete', 'brd_1', 'itm_1', '--yes',
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BOARDS}/brd_1/items/itm_1`)
    expect(init.method).toBe('DELETE')
  })

  it('delete without --yes in non-TTY refuses to run', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false })
    await expect(
      createProgram().parseAsync(['node', 'sawala', 'tugasna', 'item', 'delete', 'brd_1', 'itm_1']),
    ).rejects.toThrow(/Refusing destructive operation without --yes/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sawala tugasna backlog', () => {
  it('list GETs /backlog', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'tugasna', 'backlog', 'list'])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${PROJECT}/backlog`)
  })

  it('create POSTs /items (project-level)', async () => {
    const body = { title: 'Backlog idea' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'itm_9', ...body }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'backlog', 'create', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${PROJECT}/items`)
    expect(init.method).toBe('POST')
  })

  it('place POSTs /items/<itemId>/place', async () => {
    const body = { boardId: 'brd_1', statusId: 'sta_1' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'itm_9' }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'backlog', 'place', 'itm_9', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${PROJECT}/items/itm_9/place`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('unplace POSTs /items/<itemId>/unplace', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'itm_9' }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'tugasna', 'backlog', 'unplace', 'itm_9'])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${PROJECT}/items/itm_9/unplace`)
    expect(init.method).toBe('POST')
  })
})

describe('sawala tugasna comment', () => {
  it('list GETs /items/<itemId>/comments', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'tugasna', 'comment', 'list', 'itm_1'])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${PROJECT}/items/itm_1/comments`)
  })

  it('create POSTs the body to /items/<itemId>/comments', async () => {
    const body = { body: 'Looks good' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'cmt_1', ...body }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'tugasna', 'comment', 'create', 'itm_1', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${PROJECT}/items/itm_1/comments`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('delete without --yes in non-TTY refuses to run', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false })
    await expect(
      createProgram().parseAsync(['node', 'sawala', 'tugasna', 'comment', 'delete', 'itm_1', 'cmt_1']),
    ).rejects.toThrow(/Refusing destructive operation without --yes/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sawala tugasna timeline / tag', () => {
  it('timeline GETs /timeline', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'tugasna', 'timeline'])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${PROJECT}/timeline`)
  })

  it('tag list GETs /tags and prints a column per tag', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ id: 'tag_1', name: 'urgent' }]))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'tugasna', 'tag', 'list'])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${PROJECT}/tags`)
    expect(cap.lines.join('')).toContain('urgent')
  })
})
