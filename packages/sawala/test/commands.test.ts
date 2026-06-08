import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import prompts from 'prompts'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readConfig, updateConfig, SAWALA_BRAND } from '@sawala/auth'
import { createWhoamiCommand } from '../src/commands/whoami'
import { createOrgCommand } from '../src/commands/org'
import { createProjectCommand } from '../src/commands/project'

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

describe('sawala org use (interactive)', () => {
  const ORGS = [
    { id: 'org_1', slug: 'acme', name: 'Acme' },
    { id: 'org_2', slug: 'globex', name: 'Globex' },
  ]

  // URL-aware mock: /me/orgs → org list; /projects → supplied project items
  // (org switch resolves a project too).
  function mockFetch(opts: {
    orgs?: typeof ORGS
    projects?: Array<{ id: string; slug: string; name: string }>
  }) {
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

  it('with no slug, prompts for the org and persists the pick', async () => {
    mockFetch({})
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

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
    const cfg = await readConfig(SAWALA_BRAND)
    expect(cfg.activeOrg).toBe('globex')
  })

  it('with a single available org, auto-selects without prompting', async () => {
    mockFetch({ orgs: [ORGS[0]!] })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const org = createOrgCommand()
    await org.parseAsync(['node', 'org', 'use'])

    writeSpy.mockRestore()
    const cfg = await readConfig(SAWALA_BRAND)
    expect(cfg.activeOrg).toBe('acme')
  })

  it('switching org auto-selects the org’s sole project (slug + id)', async () => {
    mockFetch({ projects: [{ id: 'proj_1', slug: 'blog', name: 'Blog' }] })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const org = createOrgCommand()
    await org.parseAsync(['node', 'org', 'use', 'acme'])

    writeSpy.mockRestore()
    const cfg = await readConfig(SAWALA_BRAND)
    expect(cfg.activeOrg).toBe('acme')
    expect(cfg.activeProject).toBe('blog')
    expect(cfg.activeProjectId).toBe('proj_1')
  })
})

describe('sawala project use (interactive)', () => {
  const PROJECTS = {
    items: [
      { id: 'proj_1', slug: 'blog', name: 'Blog' },
      { id: 'proj_2', slug: 'shop', name: 'Shop' },
    ],
    nextCursor: null,
  }

  it('with no slug, prompts and persists the pick (slug + id)', async () => {
    await updateConfig(SAWALA_BRAND, { activeOrg: 'acme' })

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(PROJECTS), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const origTTY = process.stdout.isTTY
    ;(process.stdout as { isTTY?: boolean }).isTTY = true
    prompts.inject(['shop'])

    try {
      const project = createProjectCommand()
      await project.parseAsync(['node', 'project', 'use'])
    } finally {
      ;(process.stdout as { isTTY?: boolean }).isTTY = origTTY
    }

    writeSpy.mockRestore()
    const cfg = await readConfig(SAWALA_BRAND)
    expect(cfg.activeProject).toBe('shop')
    expect(cfg.activeProjectId).toBe('proj_2')
  })
})
