import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeCredentials } from '../src/lib/credentials'
import { writeConfig } from '../src/lib/config'
import {
  NotLoggedInError,
  TokenScopeMismatchError,
  assertTokenScope,
  loadContext,
} from '../src/lib/resolve'

const VALID_TOKEN = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const OTHER_TOKEN = 'koda_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

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
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'kodena-resolve-'))
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  process.env['KODENA_CONFIG_DIR'] = tmpDir
})

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('loadContext token resolution', () => {
  it('throws NotLoggedInError with no token in any source', async () => {
    await expect(loadContext()).rejects.toBeInstanceOf(NotLoggedInError)
  })

  it('uses --token flag with highest priority', async () => {
    process.env['KODENA_API_TOKEN'] = OTHER_TOKEN
    await writeCredentials({
      token: OTHER_TOKEN,
      apiBase: 'https://api.sawala.cloud',
      savedAt: '2026-05-19T00:00:00Z',
      scopeOrgId: null,
      scopeOrgSlug: null,
    })
    const ctx = await loadContext({ token: VALID_TOKEN })
    expect(ctx.token).toBe(VALID_TOKEN)
    expect(ctx.tokenSource).toBe('flag')
  })

  it('falls back to env when no flag is set', async () => {
    process.env['KODENA_API_TOKEN'] = VALID_TOKEN
    const ctx = await loadContext()
    expect(ctx.token).toBe(VALID_TOKEN)
    expect(ctx.tokenSource).toBe('env')
  })

  it('falls back to credentials file when no flag or env is set', async () => {
    await writeCredentials({
      token: VALID_TOKEN,
      apiBase: 'https://api.staging.sawala.cloud',
      savedAt: '2026-05-19T00:00:00Z',
      scopeOrgId: 'org_acme',
      scopeOrgSlug: 'acme',
    })
    const ctx = await loadContext()
    expect(ctx.token).toBe(VALID_TOKEN)
    expect(ctx.tokenSource).toBe('file')
    expect(ctx.apiBase).toBe('https://api.staging.sawala.cloud')
    expect(ctx.scopeOrgSlug).toBe('acme')
  })

  it('rejects a non-koda_ token even from --token', async () => {
    await expect(loadContext({ token: 'pk_live_xxx' })).rejects.toThrow(
      /doesn't look like a Sawala CLI token/,
    )
  })
})

describe('loadContext org/project resolution', () => {
  beforeEach(async () => {
    await writeCredentials({
      token: VALID_TOKEN,
      apiBase: 'https://api.sawala.cloud',
      savedAt: '2026-05-19T00:00:00Z',
      scopeOrgId: null,
      scopeOrgSlug: null,
    })
  })

  it('precedence: --org > KODENA_ORG > config', async () => {
    process.env['KODENA_ORG'] = 'from-env'
    await writeConfig({ activeOrg: 'from-config', activeProject: null })

    expect((await loadContext({ org: 'from-flag' })).activeOrg).toBe('from-flag')

    expect((await loadContext()).activeOrg).toBe('from-env')

    delete process.env['KODENA_ORG']
    expect((await loadContext()).activeOrg).toBe('from-config')
  })

  it('precedence: --project > KODENA_PROJECT > config', async () => {
    process.env['KODENA_PROJECT'] = 'from-env'
    await writeConfig({ activeOrg: null, activeProject: 'from-config' })

    expect((await loadContext({ project: 'from-flag' })).activeProject).toBe('from-flag')
    expect((await loadContext()).activeProject).toBe('from-env')
    delete process.env['KODENA_PROJECT']
    expect((await loadContext()).activeProject).toBe('from-config')
  })

  it('returns null org/project when no source provides one', async () => {
    const ctx = await loadContext()
    expect(ctx.activeOrg).toBeNull()
    expect(ctx.activeProject).toBeNull()
  })
})

describe('assertTokenScope', () => {
  const baseCtx = {
    token: VALID_TOKEN,
    apiBase: 'https://api.sawala.cloud',
    activeOrg: 'acme' as string | null,
    activeProject: null as string | null,
    activeProjectId: null as string | null,
    scopeOrgId: 'org_acme' as string | null,
    scopeOrgSlug: 'acme' as string | null,
    tokenSource: 'file' as const,
  }

  it('passes through when token is all-orgs (scopeOrgSlug=null)', () => {
    expect(() =>
      assertTokenScope({ ...baseCtx, scopeOrgSlug: null }, 'whatever'),
    ).not.toThrow()
  })

  it('passes through when no target is provided and no activeOrg is set', () => {
    expect(() =>
      assertTokenScope({ ...baseCtx, activeOrg: null }, null),
    ).not.toThrow()
  })

  it('throws TokenScopeMismatchError when target differs from scope', () => {
    expect(() => assertTokenScope(baseCtx, 'widgets')).toThrow(TokenScopeMismatchError)
  })

  it('passes when target matches scope', () => {
    expect(() => assertTokenScope(baseCtx, 'acme')).not.toThrow()
  })

  it('defaults to activeOrg when target is omitted', () => {
    expect(() => assertTokenScope(baseCtx)).not.toThrow()
    expect(() =>
      assertTokenScope({ ...baseCtx, activeOrg: 'widgets' }),
    ).toThrow(TokenScopeMismatchError)
  })
})
