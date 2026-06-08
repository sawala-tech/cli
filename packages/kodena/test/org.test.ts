import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import prompts from 'prompts'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readConfig, updateConfig } from '../src/lib/config'
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

const ORGS = [
  { id: 'org_1', slug: 'acme', name: 'Acme' },
  { id: 'org_2', slug: 'globex', name: 'Globex' },
]

/**
 * URL-aware fetch mock: `/me/orgs` returns the org list; the projects endpoint
 * returns the supplied project items (org switch resolves a project too).
 */
function mockFetch(opts: { orgs?: typeof ORGS; projects?: Array<{ id: string; slug: string; name: string }> }) {
  const orgs = opts.orgs ?? ORGS
  const projects = opts.projects ?? []
  const fetchMock = vi.fn(async (url: string) => {
    const body = String(url).includes('/projects')
      ? JSON.stringify({ items: projects, nextCursor: null })
      : JSON.stringify(orgs)
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function withTTY<T>(fn: () => Promise<T>): Promise<T> {
  const orig = process.stdout.isTTY
  ;(process.stdout as { isTTY?: boolean }).isTTY = true
  try {
    return await fn()
  } finally {
    ;(process.stdout as { isTTY?: boolean }).isTTY = orig
  }
}

describe('kodena org use (interactive)', () => {
  it('with no slug, prompts for the org and persists the pick', async () => {
    mockFetch({})
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    prompts.inject(['globex'])

    await withTTY(async () => {
      const org = createOrgCommand()
      await org.parseAsync(['node', 'org', 'use'])
    })

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeOrg).toBe('globex')
  })

  it('with a single available org, auto-selects without prompting', async () => {
    mockFetch({ orgs: [ORGS[0]!] })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const org = createOrgCommand()
    await org.parseAsync(['node', 'org', 'use'])

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeOrg).toBe('acme')
  })

  it('with an explicit slug, sets it without prompting', async () => {
    mockFetch({})
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const org = createOrgCommand()
    await org.parseAsync(['node', 'org', 'use', 'acme'])

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeOrg).toBe('acme')
  })
})

describe('kodena org use → project resolution', () => {
  it('auto-selects the sole project of the new org', async () => {
    mockFetch({ projects: [{ id: 'proj_1', slug: 'blog', name: 'Blog' }] })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const org = createOrgCommand()
    await org.parseAsync(['node', 'org', 'use', 'acme'])

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeOrg).toBe('acme')
    expect(cfg.activeProject).toBe('blog')
    expect(cfg.activeProjectId).toBe('proj_1')
  })

  it('prompts for a project when the new org has several', async () => {
    mockFetch({
      projects: [
        { id: 'proj_1', slug: 'blog', name: 'Blog' },
        { id: 'proj_2', slug: 'shop', name: 'Shop' },
      ],
    })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    prompts.inject(['shop'])

    await withTTY(async () => {
      const org = createOrgCommand()
      await org.parseAsync(['node', 'org', 'use', 'acme'])
    })

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeProject).toBe('shop')
    expect(cfg.activeProjectId).toBe('proj_2')
  })

  it('clears a stale active project when the new org has none', async () => {
    // Pretend we were on another org with a project selected.
    await updateConfig({ activeOrg: 'globex', activeProject: 'old', activeProjectId: 'proj_old' })
    mockFetch({ projects: [] })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const org = createOrgCommand()
    await org.parseAsync(['node', 'org', 'use', 'acme'])

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeOrg).toBe('acme')
    expect(cfg.activeProject).toBeNull()
    expect(cfg.activeProjectId).toBeNull()
  })
})
