import { promises as fs } from 'node:fs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CliContext } from '../src/lib/auth'
import { ALL_TOOLS, TOOLS_BY_NAME } from '../src/tools'

const ctx: CliContext = {
  token: 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  apiBase: 'https://api.sawala.cloud',
  activeOrg: 'acme',
  activeProject: 'blog',
  scopeOrgId: null,
  scopeOrgSlug: null,
  tokenSource: 'file',
}

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(response: { status: number; body: unknown }): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => {
    if (response.status === 204) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('tool registry', () => {
  it('exposes 8 read (M2) + 3 non-destructive write (M3) + 7 destructive (M4) tools', () => {
    expect(ALL_TOOLS).toHaveLength(18)
    const readOnly = ALL_TOOLS.filter((t) => t.annotations.readOnlyHint === true)
    const writes = ALL_TOOLS.filter((t) => t.annotations.readOnlyHint === false)
    const destructive = ALL_TOOLS.filter((t) => t.annotations.destructiveHint === true)
    expect(readOnly).toHaveLength(8)
    expect(writes).toHaveLength(10)
    expect(destructive).toHaveLength(7)
    // delete_script is the only irreversibleHint.
    const irreversible = ALL_TOOLS.filter((t) => t.annotations.irreversibleHint === true)
    expect(irreversible.map((t) => t.name)).toEqual(['kodena_delete_script'])
  })

  it('only set/remove custom-domain tools carry openWorldHint', () => {
    const openWorld = ALL_TOOLS.filter((t) => t.annotations.openWorldHint === true)
    expect(openWorld.map((t) => t.name).sort()).toEqual([
      'kodena_remove_custom_domain',
      'kodena_set_custom_domain',
    ])
  })

  it('lookup by name returns each tool', () => {
    expect(TOOLS_BY_NAME.get('kodena_whoami')?.name).toBe('kodena_whoami')
    expect(TOOLS_BY_NAME.get('kodena_deploy_script')?.name).toBe('kodena_deploy_script')
    expect(TOOLS_BY_NAME.get('kodena_delete_script')?.name).toBe('kodena_delete_script')
    expect(TOOLS_BY_NAME.get('nonexistent')).toBeUndefined()
  })

  it('every tool has a non-empty LLM-facing description', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(40)
    }
  })
})

describe('kodena_whoami', () => {
  const tool = TOOLS_BY_NAME.get('kodena_whoami')!

  it('rejects unknown input keys (strict schema)', () => {
    expect(() => tool.parseInput({ extra: true })).toThrow(/Invalid tool input/)
  })

  it('returns merged identity + context on success', async () => {
    mockFetch({
      status: 200,
      body: {
        id: 'user_1',
        email: 'sutisna@sawala.co',
        displayName: 'Sutisna',
        orgId: 'org_1',
        orgSlug: 'acme',
        tokenScope: {
          tokenId: 'tk_1',
          scopeOrgId: null,
          scopeOrgSlug: null,
          label: 'laptop',
        },
      },
    })
    const result = (await tool.handle(tool.parseInput({}), ctx)) as Record<string, unknown>
    expect(result['email']).toBe('sutisna@sawala.co')
    expect(result['activeOrg']).toBe('acme')
    expect(result['tokenScope']).toEqual({ scopeOrgSlug: null, label: 'laptop' })
  })
})

describe('kodena_list_orgs', () => {
  const tool = TOOLS_BY_NAME.get('kodena_list_orgs')!

  it('flags the active org and respects token scope', async () => {
    mockFetch({
      status: 200,
      body: [
        { id: 'org_1', slug: 'acme', name: 'Acme' },
        { id: 'org_2', slug: 'globex', name: 'Globex' },
      ],
    })
    const result = (await tool.handle(tool.parseInput({}), {
      ...ctx,
      scopeOrgSlug: 'acme',
      scopeOrgId: 'org_1',
    })) as { orgs: Array<{ slug: string; isActive: boolean; isInTokenScope: boolean }> }
    expect(result.orgs).toEqual([
      { id: 'org_1', slug: 'acme', name: 'Acme', isActive: true, isInTokenScope: true },
      { id: 'org_2', slug: 'globex', name: 'Globex', isActive: false, isInTokenScope: false },
    ])
  })
})

describe('kodena_list_projects', () => {
  const tool = TOOLS_BY_NAME.get('kodena_list_projects')!

  it('calls /cli/organization/projects?limit=100 and surfaces nextCursor', async () => {
    const mock = mockFetch({
      status: 200,
      body: {
        items: [
          {
            id: 'proj_1',
            slug: 'blog',
            name: 'Blog',
            orgId: 'org_1',
            createdAt: '2026-05-01T00:00:00Z',
          },
        ],
        nextCursor: null,
      },
    })
    const result = (await tool.handle(tool.parseInput({}), ctx)) as {
      projects: Array<{ slug: string; isActive: boolean }>
      nextCursor: null
    }
    expect(mock.mock.calls[0]?.[0]).toBe('https://api.sawala.cloud/cli/organization/projects?limit=100')
    expect(result.projects[0]?.isActive).toBe(true)
    expect(result.nextCursor).toBeNull()
  })
})

describe('kodena_list_scripts', () => {
  const tool = TOOLS_BY_NAME.get('kodena_list_scripts')!

  it('resolves the public URL: custom hostname wins over tenant subdomain', async () => {
    mockFetch({
      status: 200,
      body: [
        {
          slug: 'a',
          orgHandle: 'acme',
          tenantSubdomain: 'a-acme',
          customHostname: 'acme.com',
          kind: 'worker-bundle',
          createdAt: '',
          updatedAt: '',
        },
        {
          slug: 'b',
          orgHandle: 'acme',
          tenantSubdomain: 'b-acme',
          customHostname: null,
          kind: 'assets',
          createdAt: '',
          updatedAt: '',
        },
        {
          slug: 'c',
          orgHandle: 'acme',
          tenantSubdomain: null,
          customHostname: null,
          kind: 'worker-bundle',
          createdAt: '',
          updatedAt: '',
        },
      ],
    })
    const result = (await tool.handle(tool.parseInput({}), ctx)) as {
      count: number
      scripts: Array<{ slug: string; url: string | null }>
    }
    expect(result.count).toBe(3)
    expect(result.scripts[0]?.url).toBe('https://acme.com')
    expect(result.scripts[1]?.url).toBe('https://b-acme.kodena.id')
    expect(result.scripts[2]?.url).toBe('https://c-acme.kodena.id')
  })
})

describe('kodena_get_script', () => {
  const tool = TOOLS_BY_NAME.get('kodena_get_script')!

  it('rejects empty slug', () => {
    expect(() => tool.parseInput({ slug: '' })).toThrow(/slug is required/)
  })

  it('rejects extra fields', () => {
    expect(() => tool.parseInput({ slug: 'ok', extra: 1 })).toThrow(/Invalid tool input/)
  })

  it('URL-encodes the slug', async () => {
    const mock = mockFetch({ status: 200, body: { slug: 'my blog' } })
    await tool.handle(tool.parseInput({ slug: 'my blog' }), ctx)
    expect(mock.mock.calls[0]?.[0]).toBe('https://api.sawala.cloud/kodena/scripts/my%20blog')
  })
})

describe('kodena_check_slug_available', () => {
  const tool = TOOLS_BY_NAME.get('kodena_check_slug_available')!

  it('rejects uppercase or punctuation in slug', () => {
    expect(() => tool.parseInput({ slug: 'MyBlog' })).toThrow(/lowercase alphanumeric/)
    expect(() => tool.parseInput({ slug: 'my_blog' })).toThrow(/lowercase alphanumeric/)
  })

  it('forwards the query string and echoes the slug back', async () => {
    const mock = mockFetch({ status: 200, body: { available: true } })
    const result = (await tool.handle(tool.parseInput({ slug: 'my-blog' }), ctx)) as {
      slug: string
      available: boolean
    }
    expect(mock.mock.calls[0]?.[0]).toBe(
      'https://api.sawala.cloud/kodena/scripts/slug-available?slug=my-blog',
    )
    expect(result).toEqual({ slug: 'my-blog', available: true })
  })
})

describe('kodena_get_org_handle', () => {
  const tool = TOOLS_BY_NAME.get('kodena_get_org_handle')!

  it('returns handle: null when unset', async () => {
    mockFetch({ status: 200, body: { handle: null } })
    const result = (await tool.handle(tool.parseInput({}), ctx)) as {
      activeOrg: string | null
      handle: string | null
    }
    expect(result).toEqual({ activeOrg: 'acme', handle: null })
  })
})

describe('kodena_get_custom_domain_status', () => {
  const tool = TOOLS_BY_NAME.get('kodena_get_custom_domain_status')!

  it('hits the per-slug custom-domain-status route', async () => {
    const mock = mockFetch({ status: 200, body: { status: 'active' } })
    await tool.handle(tool.parseInput({ slug: 'my-blog' }), ctx)
    expect(mock.mock.calls[0]?.[0]).toBe(
      'https://api.sawala.cloud/kodena/scripts/my-blog/custom-domain-status',
    )
  })
})

describe('kodena_create_script', () => {
  const tool = TOOLS_BY_NAME.get('kodena_create_script')!

  it('rejects an uppercase slug', () => {
    expect(() => tool.parseInput({ slug: 'MyBlog' })).toThrow(/lowercase alphanumeric/)
  })

  it('POSTs { scriptSlug, name } and defaults name to the slug', async () => {
    const mock = mockFetch({ status: 201, body: { slug: 'my-blog' } })
    await tool.handle(tool.parseInput({ slug: 'my-blog' }), ctx)
    const [url, init] = mock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ]
    expect(url).toBe('https://api.sawala.cloud/kodena/scripts')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ scriptSlug: 'my-blog', name: 'my-blog' })
  })

  it('uses an explicit name when provided', async () => {
    const mock = mockFetch({ status: 201, body: { slug: 'my-blog' } })
    await tool.handle(tool.parseInput({ slug: 'my-blog', name: 'My Blog' }), ctx)
    const init = mock.mock.calls[0]?.[1] as { body: string }
    expect(JSON.parse(init.body)).toEqual({ scriptSlug: 'my-blog', name: 'My Blog' })
  })

  it('is annotated non-destructive, non-idempotent', () => {
    expect(tool.annotations.destructiveHint).toBe(false)
    expect(tool.annotations.idempotentHint).toBe(false)
  })
})

describe('kodena_update_script', () => {
  const tool = TOOLS_BY_NAME.get('kodena_update_script')!

  it('requires at least one updatable field', () => {
    expect(() => tool.parseInput({ slug: 'my-blog' })).toThrow(/at least one updatable field/)
  })

  it('PATCHes /kodena/scripts/:slug with the partial body', async () => {
    const mock = mockFetch({ status: 200, body: { slug: 'my-blog', name: 'New Name' } })
    await tool.handle(tool.parseInput({ slug: 'my-blog', name: 'New Name' }), ctx)
    const [url, init] = mock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ]
    expect(url).toBe('https://api.sawala.cloud/kodena/scripts/my-blog')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ name: 'New Name' })
  })

  it('is annotated idempotent', () => {
    expect(tool.annotations.idempotentHint).toBe(true)
    expect(tool.annotations.destructiveHint).toBe(false)
  })
})

describe('kodena_set_org_handle', () => {
  const tool = TOOLS_BY_NAME.get('kodena_set_org_handle')!

  it('rejects hyphens, uppercase, and over-16-char handles', () => {
    expect(() => tool.parseInput({ handle: 'has-hyphen' })).toThrow(/lowercase alphanumeric/)
    expect(() => tool.parseInput({ handle: 'Acme' })).toThrow(/lowercase alphanumeric/)
    expect(() => tool.parseInput({ handle: 'a'.repeat(17) })).toThrow(/at most 16 chars/)
  })

  it('PUTs /kodena/org-handle with the handle', async () => {
    const mock = mockFetch({ status: 200, body: { handle: 'acme' } })
    await tool.handle(tool.parseInput({ handle: 'acme' }), ctx)
    const [url, init] = mock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ]
    expect(url).toBe('https://api.sawala.cloud/kodena/org-handle')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ handle: 'acme' })
  })

  it('is annotated idempotent (PUT)', () => {
    expect(tool.annotations.idempotentHint).toBe(true)
    expect(tool.annotations.destructiveHint).toBe(false)
  })
})

describe('kodena_deploy_script', () => {
  const tool = TOOLS_BY_NAME.get('kodena_deploy_script')!

  function makeFixture(): { dir: string; workerPath: string; assetsDir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'kodena-mcp-deploy-'))
    const workerPath = join(dir, 'worker.js')
    const assetsDir = join(dir, 'assets')
    writeFileSync(workerPath, 'export default { fetch() { return new Response("hi") } }')
    fs.mkdir(assetsDir, { recursive: true })
    return { dir, workerPath, assetsDir }
  }

  it('rejects malformed compatibilityDate', () => {
    expect(() =>
      tool.parseInput({ slug: 's', workerEntryPath: '/x', compatibilityDate: 'May 2026' }),
    ).toThrow(/YYYY-MM-DD/)
  })

  it('rejects an unknown compatibility flag', () => {
    expect(() =>
      tool.parseInput({ slug: 's', workerEntryPath: '/x', compatibilityFlags: ['bogus'] }),
    ).toThrow(/Invalid tool input/)
  })

  it('dry-run returns bundle summary without calling fetch', async () => {
    const { workerPath } = makeFixture()
    const mock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', mock)

    const result = (await tool.handle(
      tool.parseInput({ slug: 'my-blog', workerEntryPath: workerPath, dryRun: true }),
      ctx,
    )) as { dryRun: boolean; bundle: { workerBytes: number; assetCount: number } }

    expect(mock).not.toHaveBeenCalled()
    expect(result.dryRun).toBe(true)
    expect(result.bundle.workerBytes).toBeGreaterThan(0)
    expect(result.bundle.assetCount).toBe(0)
  })

  it('bundles worker + assets, base64-encodes, and POSTs to /deploy', async () => {
    const { workerPath, assetsDir } = makeFixture()
    await fs.writeFile(join(assetsDir, 'index.html'), '<!doctype html><h1>hi</h1>')
    await fs.writeFile(join(assetsDir, 'style.css'), 'body{margin:0}')

    const mock = mockFetch({ status: 200, body: { tenant_subdomain: 'my-blog-acme' } })

    await tool.handle(
      tool.parseInput({
        slug: 'my-blog',
        workerEntryPath: workerPath,
        assetsDir,
        vars: { LOG_LEVEL: 'info' },
        compatibilityFlags: ['nodejs_compat'],
        compatibilityDate: '2026-05-01',
      }),
      ctx,
    )

    const [url, init] = mock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ]
    expect(url).toBe('https://api.sawala.cloud/kodena/scripts/my-blog/deploy')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body)
    expect(body.kind).toBe('worker-bundle')
    expect(typeof body.scriptContent).toBe('string')
    expect(body.scriptContent.length).toBeGreaterThan(0)
    expect(body.assets).toHaveLength(2)
    const paths = body.assets.map((a: { path: string }) => a.path).sort()
    expect(paths).toEqual(['/index.html', '/style.css'])
    const html = body.assets.find((a: { path: string }) => a.path === '/index.html')
    expect(html.mime).toBe('text/html')
    expect(Buffer.from(html.content, 'base64').toString('utf8')).toBe(
      '<!doctype html><h1>hi</h1>',
    )
    expect(body.vars).toEqual({ LOG_LEVEL: 'info' })
    expect(body.compatibilityFlags).toEqual(['nodejs_compat'])
    expect(body.compatibilityDate).toBe('2026-05-01')
  })

  it('rejects lowercase var keys before any network call', async () => {
    const { workerPath } = makeFixture()
    const mock = vi.fn()
    vi.stubGlobal('fetch', mock)
    await expect(
      tool.handle(
        tool.parseInput({
          slug: 'my-blog',
          workerEntryPath: workerPath,
          vars: { log_level: 'info' },
        }),
        ctx,
      ),
    ).rejects.toThrow(/vars key 'log_level'/)
    expect(mock).not.toHaveBeenCalled()
  })

  it('is annotated destructive + idempotent', () => {
    expect(tool.annotations.destructiveHint).toBe(true)
    expect(tool.annotations.idempotentHint).toBe(true)
  })
})

describe('kodena_set_custom_domain', () => {
  const tool = TOOLS_BY_NAME.get('kodena_set_custom_domain')!

  it('rejects an invalid hostname', () => {
    expect(() => tool.parseInput({ slug: 's', domain: 'not a hostname' })).toThrow(
      /valid public hostname/,
    )
  })

  it('POSTs the domain to /kodena/scripts/:slug/custom-domain', async () => {
    const mock = mockFetch({ status: 201, body: { domain: 'blog.acme.com' } })
    await tool.handle(tool.parseInput({ slug: 'my-blog', domain: 'blog.acme.com' }), ctx)
    const [url, init] = mock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ]
    expect(url).toBe('https://api.sawala.cloud/kodena/scripts/my-blog/custom-domain')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ domain: 'blog.acme.com' })
  })

  it('carries openWorldHint (affects DNS)', () => {
    expect(tool.annotations.openWorldHint).toBe(true)
    expect(tool.annotations.destructiveHint).toBe(true)
  })
})

describe('kodena_remove_custom_domain', () => {
  const tool = TOOLS_BY_NAME.get('kodena_remove_custom_domain')!

  it('DELETEs /kodena/scripts/:slug/custom-domain', async () => {
    const mock = mockFetch({ status: 204, body: null })
    await tool.handle(tool.parseInput({ slug: 'my-blog' }), ctx)
    const [url, init] = mock.mock.calls[0] as unknown as [string, { method: string }]
    expect(url).toBe('https://api.sawala.cloud/kodena/scripts/my-blog/custom-domain')
    expect(init.method).toBe('DELETE')
  })
})

describe('kodena_delete_script', () => {
  const tool = TOOLS_BY_NAME.get('kodena_delete_script')!

  it('requires confirm: true', () => {
    expect(() => tool.parseInput({ slug: 'my-blog' })).toThrow(/confirm/)
    expect(() => tool.parseInput({ slug: 'my-blog', confirm: false })).toThrow(/confirm/)
  })

  it('DELETEs /kodena/scripts/:slug when confirm: true', async () => {
    const mock = mockFetch({ status: 204, body: null })
    await tool.handle(tool.parseInput({ slug: 'my-blog', confirm: true }), ctx)
    const [url, init] = mock.mock.calls[0] as unknown as [string, { method: string }]
    expect(url).toBe('https://api.sawala.cloud/kodena/scripts/my-blog')
    expect(init.method).toBe('DELETE')
  })

  it('carries irreversibleHint', () => {
    expect(tool.annotations.irreversibleHint).toBe(true)
  })
})

describe('kodena_rebuild_assets_manifest', () => {
  const tool = TOOLS_BY_NAME.get('kodena_rebuild_assets_manifest')!

  it('POSTs to /assets/rebuild-manifest', async () => {
    const mock = mockFetch({ status: 200, body: { rebuilt: true } })
    await tool.handle(tool.parseInput({ slug: 'my-blog' }), ctx)
    const [url, init] = mock.mock.calls[0] as unknown as [string, { method: string }]
    expect(url).toBe(
      'https://api.sawala.cloud/kodena/scripts/my-blog/assets/rebuild-manifest',
    )
    expect(init.method).toBe('POST')
  })
})

describe('kodena_patch_assets', () => {
  const tool = TOOLS_BY_NAME.get('kodena_patch_assets')!

  it('rejects an asset path that does not start with /', () => {
    expect(() =>
      tool.parseInput({ slug: 's', files: [{ path: 'index.html', localPath: '/tmp/x' }] }),
    ).toThrow(/must start with/)
  })

  it('requires at least one file', () => {
    expect(() => tool.parseInput({ slug: 's', files: [] })).toThrow(/at least one file/)
  })

  it('reads files from disk, infers MIME, and POSTs base64 assets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kodena-mcp-patch-'))
    const localPath = join(dir, 'banner.svg')
    await fs.writeFile(localPath, '<svg/>')

    const mock = mockFetch({ status: 200, body: { patched: 1 } })
    await tool.handle(
      tool.parseInput({
        slug: 'my-blog',
        files: [{ path: '/banner.svg', localPath }],
      }),
      ctx,
    )

    const [url, init] = mock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ]
    expect(url).toBe('https://api.sawala.cloud/kodena/scripts/my-blog/assets/patch')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body) as { assets: Array<{ path: string; mime: string; content: string }> }
    expect(body.assets).toHaveLength(1)
    expect(body.assets[0]?.path).toBe('/banner.svg')
    expect(body.assets[0]?.mime).toBe('image/svg+xml')
    expect(Buffer.from(body.assets[0]!.content, 'base64').toString('utf8')).toBe('<svg/>')
  })
})

describe('kodena_rehydrate_script', () => {
  const tool = TOOLS_BY_NAME.get('kodena_rehydrate_script')!

  it('POSTs to /rehydrate', async () => {
    const mock = mockFetch({ status: 200, body: { rehydrated: true } })
    await tool.handle(tool.parseInput({ slug: 'my-blog' }), ctx)
    const [url, init] = mock.mock.calls[0] as unknown as [string, { method: string }]
    expect(url).toBe('https://api.sawala.cloud/kodena/scripts/my-blog/rehydrate')
    expect(init.method).toBe('POST')
  })
})
