import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KODENA_BRAND, SAWALA_BRAND, type Brand } from '../src/brand'
import { writeCredentials } from '../src/credentials'
import { writeConfig } from '../src/config'
import {
  NotLoggedInError,
  TokenScopeMismatchError,
  assertTokenScope,
  loadContext,
  requireActiveOrg,
  requireActiveProject,
  requireActiveProjectId,
} from '../src/resolve'

const VALID_TOKEN = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const OTHER_TOKEN = 'koda_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

describe.each([KODENA_BRAND, SAWALA_BRAND] as Brand[])(
  'loadContext for $name',
  (brand) => {
    let tmpDir: string
    const ENV_KEYS = [
      brand.apiTokenEnvVar,
      brand.orgEnvVar,
      brand.projectEnvVar,
      brand.apiBaseEnvVar,
      brand.configDirEnvVar,
    ] as const
    const savedEnv: Partial<Record<string, string | undefined>> = {}

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(join(tmpdir(), `${brand.name}-resolve-`))
      for (const k of ENV_KEYS) {
        savedEnv[k] = process.env[k]
        delete process.env[k]
      }
      process.env[brand.configDirEnvVar] = tmpDir
    })

    afterEach(async () => {
      for (const k of ENV_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k]
        else process.env[k] = savedEnv[k]
      }
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    describe('token resolution', () => {
      it('throws NotLoggedInError with no token in any source', async () => {
        await expect(loadContext(brand)).rejects.toBeInstanceOf(NotLoggedInError)
      })

      it('NotLoggedInError message mentions the brand name and env var', async () => {
        try {
          await loadContext(brand)
          throw new Error('expected throw')
        } catch (err) {
          const msg = (err as Error).message
          expect(msg).toContain(`${brand.name} login`)
          expect(msg).toContain(brand.apiTokenEnvVar)
        }
      })

      it('uses --token flag with highest priority', async () => {
        process.env[brand.apiTokenEnvVar] = OTHER_TOKEN
        await writeCredentials(brand, {
          token: OTHER_TOKEN,
          apiBase: 'https://api.sawala.cloud',
          savedAt: '2026-05-19T00:00:00Z',
          scopeOrgId: null,
          scopeOrgSlug: null,
        })
        const ctx = await loadContext(brand, { token: VALID_TOKEN })
        expect(ctx.token).toBe(VALID_TOKEN)
        expect(ctx.tokenSource).toBe('flag')
      })

      it('falls back to env when no flag is set', async () => {
        process.env[brand.apiTokenEnvVar] = VALID_TOKEN
        const ctx = await loadContext(brand)
        expect(ctx.token).toBe(VALID_TOKEN)
        expect(ctx.tokenSource).toBe('env')
      })

      it('falls back to credentials file when no flag or env is set', async () => {
        await writeCredentials(brand, {
          token: VALID_TOKEN,
          apiBase: 'https://api.staging.sawala.cloud',
          savedAt: '2026-05-19T00:00:00Z',
          scopeOrgId: 'org_acme',
          scopeOrgSlug: 'acme',
        })
        const ctx = await loadContext(brand)
        expect(ctx.token).toBe(VALID_TOKEN)
        expect(ctx.tokenSource).toBe('file')
        expect(ctx.apiBase).toBe('https://api.staging.sawala.cloud')
        expect(ctx.scopeOrgSlug).toBe('acme')
      })

      it('rejects a non-koda_ token even from --token', async () => {
        await expect(loadContext(brand, { token: 'pk_live_xxx' })).rejects.toThrow(
          /doesn't look like a Sawala CLI token/,
        )
      })
    })

    describe('org/project resolution', () => {
      beforeEach(async () => {
        await writeCredentials(brand, {
          token: VALID_TOKEN,
          apiBase: 'https://api.sawala.cloud',
          savedAt: '2026-05-19T00:00:00Z',
          scopeOrgId: null,
          scopeOrgSlug: null,
        })
      })

      it(`precedence: --org > ${brand.orgEnvVar} > config`, async () => {
        process.env[brand.orgEnvVar] = 'from-env'
        await writeConfig(brand, {
          activeOrg: 'from-config',
          activeProject: null,
          activeProjectId: null,
        })

        expect((await loadContext(brand, { org: 'from-flag' })).activeOrg).toBe('from-flag')
        expect((await loadContext(brand)).activeOrg).toBe('from-env')

        delete process.env[brand.orgEnvVar]
        expect((await loadContext(brand)).activeOrg).toBe('from-config')
      })

      it(`precedence: --project > ${brand.projectEnvVar} > config`, async () => {
        process.env[brand.projectEnvVar] = 'from-env'
        await writeConfig(brand, {
          activeOrg: null,
          activeProject: 'from-config',
          activeProjectId: null,
        })

        expect((await loadContext(brand, { project: 'from-flag' })).activeProject).toBe(
          'from-flag',
        )
        expect((await loadContext(brand)).activeProject).toBe('from-env')
        delete process.env[brand.projectEnvVar]
        expect((await loadContext(brand)).activeProject).toBe('from-config')
      })

      it('returns null org/project when no source provides one', async () => {
        const ctx = await loadContext(brand)
        expect(ctx.activeOrg).toBeNull()
        expect(ctx.activeProject).toBeNull()
        expect(ctx.activeProjectId).toBeNull()
      })

      it('exposes activeProjectId from config', async () => {
        await writeConfig(brand, {
          activeOrg: 'acme',
          activeProject: 'blog',
          activeProjectId: 'proj_01abc',
        })
        const ctx = await loadContext(brand)
        expect(ctx.activeProjectId).toBe('proj_01abc')
      })

      it('defaults activeProjectId to null when not in config', async () => {
        await writeConfig(brand, {
          activeOrg: 'acme',
          activeProject: 'blog',
          activeProjectId: null,
        })
        const ctx = await loadContext(brand)
        expect(ctx.activeProjectId).toBeNull()
      })
    })
  },
)

describe.each([KODENA_BRAND, SAWALA_BRAND] as Brand[])(
  'assertTokenScope for $name',
  (brand) => {
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
        assertTokenScope({ ...baseCtx, scopeOrgSlug: null }, 'whatever', brand),
      ).not.toThrow()
    })

    it('passes through when no target is provided and no activeOrg is set', () => {
      expect(() =>
        assertTokenScope({ ...baseCtx, activeOrg: null }, null, brand),
      ).not.toThrow()
    })

    it('throws TokenScopeMismatchError when target differs from scope', () => {
      expect(() => assertTokenScope(baseCtx, 'widgets', brand)).toThrow(
        TokenScopeMismatchError,
      )
    })

    it('passes when target matches scope', () => {
      expect(() => assertTokenScope(baseCtx, 'acme', brand)).not.toThrow()
    })

    it('defaults to activeOrg when target is omitted', () => {
      expect(() => assertTokenScope(baseCtx, undefined, brand)).not.toThrow()
      expect(() =>
        assertTokenScope({ ...baseCtx, activeOrg: 'widgets' }, undefined, brand),
      ).toThrow(TokenScopeMismatchError)
    })
  },
)

describe.each([KODENA_BRAND, SAWALA_BRAND] as Brand[])(
  'requireActive helpers for $name',
  (brand) => {
    const ctxNoOrg = {
      token: VALID_TOKEN,
      apiBase: 'https://api.sawala.cloud',
      activeOrg: null,
      activeProject: null,
      activeProjectId: null,
      scopeOrgId: null,
      scopeOrgSlug: null,
      tokenSource: 'file' as const,
    }

    it(`requireActiveOrg throws with brand-specific message when missing`, () => {
      expect(() => requireActiveOrg(ctxNoOrg, brand)).toThrow(
        new RegExp(`${brand.name} org use`),
      )
    })

    it('requireActiveOrg returns the slug when set', () => {
      expect(requireActiveOrg({ ...ctxNoOrg, activeOrg: 'acme' }, brand)).toBe('acme')
    })

    it(`requireActiveProject throws with brand-specific message when missing`, () => {
      expect(() => requireActiveProject(ctxNoOrg, brand)).toThrow(
        new RegExp(`${brand.name} project use`),
      )
    })

    it('requireActiveProject returns the slug when set', () => {
      expect(requireActiveProject({ ...ctxNoOrg, activeProject: 'blog' }, brand)).toBe('blog')
    })

    it(`requireActiveProjectId throws with brand-specific message when missing`, () => {
      expect(() => requireActiveProjectId(ctxNoOrg, brand)).toThrow(
        new RegExp(`${brand.name} project use`),
      )
    })

    it('requireActiveProjectId returns the id when set', () => {
      expect(
        requireActiveProjectId({ ...ctxNoOrg, activeProjectId: 'proj_01abc' }, brand),
      ).toBe('proj_01abc')
    })
  },
)
