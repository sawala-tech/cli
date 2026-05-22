import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KODENA_BRAND, SAWALA_BRAND, type Brand } from '../src/brand'
import {
  type Credentials,
  credentialsPath,
  deleteCredentials,
  readCredentials,
  writeCredentials,
} from '../src/credentials'

const VALID: Credentials = {
  token: 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  apiBase: 'https://api.sawala.cloud',
  savedAt: '2026-05-19T10:00:00.000Z',
  scopeOrgId: 'org_acme',
  scopeOrgSlug: 'acme',
}

describe.each([KODENA_BRAND, SAWALA_BRAND] as Brand[])(
  'credentials for $name',
  (brand) => {
    let tmpDir: string
    let originalConfigDir: string | undefined

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(join(tmpdir(), `${brand.name}-creds-`))
      originalConfigDir = process.env[brand.configDirEnvVar]
      process.env[brand.configDirEnvVar] = tmpDir
    })

    afterEach(async () => {
      if (originalConfigDir === undefined) delete process.env[brand.configDirEnvVar]
      else process.env[brand.configDirEnvVar] = originalConfigDir
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('returns null when no file exists', async () => {
      expect(await readCredentials(brand)).toBeNull()
    })

    it('round-trips a valid credentials object', async () => {
      await writeCredentials(brand, VALID)
      const back = await readCredentials(brand)
      expect(back).toEqual(VALID)
    })

    it('writes the credentials file with mode 0600', async () => {
      await writeCredentials(brand, VALID)
      const stat = await fs.stat(credentialsPath(brand))
      expect(stat.mode & 0o777).toBe(0o600)
    })

    it("rejects a token that doesn't match the koda_ pattern on read", async () => {
      await fs.mkdir(tmpDir, { recursive: true })
      await fs.writeFile(
        credentialsPath(brand),
        JSON.stringify({ ...VALID, token: 'not_a_kodena_token' }),
        'utf8',
      )
      await expect(readCredentials(brand)).rejects.toThrow(/token/i)
    })

    it('rejects malformed JSON', async () => {
      await fs.mkdir(tmpDir, { recursive: true })
      await fs.writeFile(credentialsPath(brand), 'this is not json', 'utf8')
      await expect(readCredentials(brand)).rejects.toThrow(/not valid JSON/)
    })

    it('overwrites existing credentials atomically (no temp files left behind)', async () => {
      await writeCredentials(brand, VALID)
      await writeCredentials(brand, { ...VALID, savedAt: '2026-05-20T00:00:00.000Z' })
      const back = await readCredentials(brand)
      expect(back?.savedAt).toBe('2026-05-20T00:00:00.000Z')
      const dir = await fs.readdir(tmpDir)
      const tmpFiles = dir.filter((f) => f.includes('.tmp.'))
      expect(tmpFiles).toEqual([])
    })

    it('deleteCredentials removes the file', async () => {
      await writeCredentials(brand, VALID)
      await deleteCredentials(brand)
      expect(await readCredentials(brand)).toBeNull()
    })

    it('deleteCredentials is idempotent when the file is absent', async () => {
      await expect(deleteCredentials(brand)).resolves.toBeUndefined()
      await expect(deleteCredentials(brand)).resolves.toBeUndefined()
    })

    it(`credentialsPath includes the brand-specific config dir`, () => {
      expect(credentialsPath(brand)).toBe(join(tmpDir, 'credentials'))
    })
  },
)
