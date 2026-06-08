import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import prompts from 'prompts'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readConfig } from '../src/lib/config'
import { createOrgCommand } from '../src/commands/org'

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
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'kodena-org-'))
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

describe('kodena org use (interactive)', () => {
  const ORGS = [
    { id: 'org_1', slug: 'acme', name: 'Acme' },
    { id: 'org_2', slug: 'globex', name: 'Globex' },
  ]

  it('with no slug, prompts for the org and persists the pick', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(ORGS), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    // The interactive picker only runs in a TTY; simulate one.
    const origTTY = process.stdout.isTTY
    ;(process.stdout as { isTTY?: boolean }).isTTY = true

    prompts.inject(['globex'])

    try {
      const org = createOrgCommand()
      await org.parseAsync(['node', 'org', 'use'])
    } finally {
      ;(process.stdout as { isTTY?: boolean }).isTTY = origTTY
    }

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeOrg).toBe('globex')
  })

  it('with a single available org, auto-selects without prompting', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify([ORGS[0]]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const org = createOrgCommand()
    await org.parseAsync(['node', 'org', 'use'])

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeOrg).toBe('acme')
  })

  it('with an explicit slug, sets it without prompting', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(ORGS), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const org = createOrgCommand()
    await org.parseAsync(['node', 'org', 'use', 'acme'])

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeOrg).toBe('acme')
  })
})
