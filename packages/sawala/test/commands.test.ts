import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWhoamiCommand } from '../src/commands/whoami'
import { createOrgCommand } from '../src/commands/org'

const VALID_TOKEN = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

let tmpDir: string
const ENV_KEYS = [
  'SAWALA_API_TOKEN',
  'SAWALA_ORG',
  'SAWALA_PROJECT',
  'SAWALA_API_BASE',
  'SAWALA_CONFIG_DIR',
] as const
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'sawala-cmd-'))
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  process.env['SAWALA_CONFIG_DIR'] = tmpDir
  process.env['SAWALA_API_TOKEN'] = VALID_TOKEN
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('sawala whoami', () => {
  it('hits /cli/organization/me', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'u1',
            email: 'e@example.com',
            displayName: null,
            orgId: null,
            orgSlug: null,
            tokenScope: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    // Suppress stdout from the command's writes
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const cmd = createWhoamiCommand()
    await cmd.parseAsync(['node', 'whoami'])

    writeSpy.mockRestore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sawala.cloud/cli/organization/me')
  })
})

describe('sawala org list', () => {
  it('hits /cli/organization/me/orgs', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const org = createOrgCommand()
    await org.parseAsync(['node', 'org', 'list'])

    writeSpy.mockRestore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sawala.cloud/cli/organization/me/orgs')
  })
})
