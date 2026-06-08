import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { updateConfig } from '../src/lib/config'
import { createScriptCommand } from '../src/commands/script'

const VALID_TOKEN = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

let tmpDir: string
const ENV_KEYS = [
  'KODENA_API_TOKEN',
  'KODENA_ORG',
  'KODENA_PROJECT',
  'KODENA_API_BASE',
  'KODENA_CONFIG_DIR',
] as const
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'kodena-script-'))
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  process.env['KODENA_CONFIG_DIR'] = tmpDir
  process.env['KODENA_API_TOKEN'] = VALID_TOKEN
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('kodena script list', () => {
  it('sends org + project context to GET /kodena/scripts', async () => {
    await updateConfig({ activeOrg: 'acme', activeProject: 'blog' })

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const script = createScriptCommand()
    await script.parseAsync(['node', 'script', 'list'])

    writeSpy.mockRestore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sawala.cloud/kodena/scripts')
    const headers = init.headers as Record<string, string>
    expect(headers['x-org-id']).toBe('acme')
    expect(headers['x-project-id']).toBe('blog')
  })

  it('errors (no network call) when no active project is set', async () => {
    // Scripts are project-scoped — without a project the CLI must fail fast
    // rather than emit a request that the backend would 400 with
    // tenant-headers-missing.
    await updateConfig({ activeOrg: 'acme' })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const script = createScriptCommand()
    await expect(script.parseAsync(['node', 'script', 'list'])).rejects.toThrow(/active project/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
