import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import prompts from 'prompts'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readConfig, updateConfig } from '../src/lib/config'
import { createProjectCommand } from '../src/commands/project'

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
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'kodena-project-'))
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

const PROJECTS = {
  items: [
    { id: 'proj_1', slug: 'blog', name: 'Blog' },
    { id: 'proj_2', slug: 'shop', name: 'Shop' },
  ],
  nextCursor: null,
}

function mockProjects() {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(PROJECTS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('kodena project use (interactive)', () => {
  it('with no slug, prompts and persists the pick', async () => {
    await updateConfig({ activeOrg: 'acme' })
    mockProjects()
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
    const cfg = await readConfig()
    expect(cfg.activeProject).toBe('shop')
  })

  it('with a single project, auto-selects without prompting', async () => {
    await updateConfig({ activeOrg: 'acme' })
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [PROJECTS.items[0]], nextCursor: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const project = createProjectCommand()
    await project.parseAsync(['node', 'project', 'use'])

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeProject).toBe('blog')
  })

  it('with an explicit slug, sets it without prompting', async () => {
    await updateConfig({ activeOrg: 'acme' })
    mockProjects()
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const project = createProjectCommand()
    await project.parseAsync(['node', 'project', 'use', 'blog'])

    writeSpy.mockRestore()
    const cfg = await readConfig()
    expect(cfg.activeProject).toBe('blog')
  })
})
