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
  it('exposes exactly 8 read-only tools (M2)', () => {
    expect(ALL_TOOLS).toHaveLength(8)
    for (const tool of ALL_TOOLS) {
      expect(tool.annotations.readOnlyHint).toBe(true)
      expect(tool.annotations.destructiveHint).toBeUndefined()
    }
  })

  it('lookup by name returns each tool', () => {
    expect(TOOLS_BY_NAME.get('kodena_whoami')?.name).toBe('kodena_whoami')
    expect(TOOLS_BY_NAME.get('kodena_list_scripts')?.name).toBe('kodena_list_scripts')
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

  it('calls /projects?limit=100 and surfaces nextCursor', async () => {
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
    expect(mock.mock.calls[0]?.[0]).toBe('https://api.sawala.cloud/projects?limit=100')
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
