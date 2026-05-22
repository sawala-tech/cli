import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KODENA_BRAND, SAWALA_BRAND, type Brand } from '../src/brand'
import { readConfig, updateConfig, writeConfig } from '../src/config'

describe.each([KODENA_BRAND, SAWALA_BRAND] as Brand[])(
  'config for $name',
  (brand) => {
    let tmpDir: string
    let originalConfigDir: string | undefined

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(join(tmpdir(), `${brand.name}-cfg-`))
      originalConfigDir = process.env[brand.configDirEnvVar]
      process.env[brand.configDirEnvVar] = tmpDir
    })

    afterEach(async () => {
      if (originalConfigDir === undefined) delete process.env[brand.configDirEnvVar]
      else process.env[brand.configDirEnvVar] = originalConfigDir
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('returns empty config when no file exists', async () => {
      expect(await readConfig(brand)).toEqual({
        activeOrg: null,
        activeProject: null,
        activeProjectId: null,
      })
    })

    it('readConfig defaults activeProjectId to null for legacy files with only the old two fields', async () => {
      await fs.writeFile(
        join(tmpDir, 'config'),
        JSON.stringify({ activeOrg: 'acme', activeProject: 'blog' }),
        'utf8',
      )
      expect(await readConfig(brand)).toEqual({
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: null,
      })
    })

    it('round-trips writes', async () => {
      await writeConfig(brand, {
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: null,
      })
      expect(await readConfig(brand)).toEqual({
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: null,
      })
    })

    it('round-trips a config with activeProjectId set', async () => {
      await writeConfig(brand, {
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: 'proj_01abc',
      })
      expect(await readConfig(brand)).toEqual({
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: 'proj_01abc',
      })
    })

    it('updateConfig merges partial updates', async () => {
      await writeConfig(brand, {
        activeOrg: 'acme',
        activeProject: null,
        activeProjectId: null,
      })
      const next = await updateConfig(brand, { activeProject: 'blog' })
      expect(next).toEqual({
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: null,
      })
      expect(await readConfig(brand)).toEqual({
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: null,
      })
    })

    it('updateConfig({ activeProjectId }) preserves other fields', async () => {
      await writeConfig(brand, {
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: null,
      })
      const next = await updateConfig(brand, { activeProjectId: 'proj_01abc' })
      expect(next).toEqual({
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: 'proj_01abc',
      })
    })

    it('updateConfig clears a field when null is explicitly passed', async () => {
      await writeConfig(brand, {
        activeOrg: 'acme',
        activeProject: 'blog',
        activeProjectId: 'proj_01abc',
      })
      const next = await updateConfig(brand, { activeProject: null })
      expect(next.activeProject).toBeNull()
      expect(next.activeProjectId).toBe('proj_01abc')
    })

    it('rejects malformed JSON', async () => {
      await fs.writeFile(join(tmpDir, 'config'), 'not json', 'utf8')
      await expect(readConfig(brand)).rejects.toThrow(/not valid JSON/)
    })
  },
)
