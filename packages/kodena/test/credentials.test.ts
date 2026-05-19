import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  Credentials,
  credentialsPath,
  deleteCredentials,
  readCredentials,
  writeCredentials,
} from '../src/lib/credentials'

const VALID: Credentials = {
  token: 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  apiBase: 'https://api.sawala.cloud',
  savedAt: '2026-05-19T10:00:00.000Z',
  scopeOrgId: 'org_acme',
  scopeOrgSlug: 'acme',
}

let tmpDir: string
let originalConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'kodena-creds-'))
  originalConfigDir = process.env['KODENA_CONFIG_DIR']
  process.env['KODENA_CONFIG_DIR'] = tmpDir
})

afterEach(async () => {
  if (originalConfigDir === undefined) delete process.env['KODENA_CONFIG_DIR']
  else process.env['KODENA_CONFIG_DIR'] = originalConfigDir
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('credentials', () => {
  it('returns null when no file exists', async () => {
    expect(await readCredentials()).toBeNull()
  })

  it('round-trips a valid credentials object', async () => {
    await writeCredentials(VALID)
    const back = await readCredentials()
    expect(back).toEqual(VALID)
  })

  it('writes the credentials file with mode 0600', async () => {
    await writeCredentials(VALID)
    const stat = await fs.stat(credentialsPath())
    expect(stat.mode & 0o777).toBe(0o600)
  })

  it('rejects a token that doesn\'t match the koda_ pattern on read', async () => {
    await fs.mkdir(tmpDir, { recursive: true })
    await fs.writeFile(
      credentialsPath(),
      JSON.stringify({ ...VALID, token: 'not_a_kodena_token' }),
      'utf8',
    )
    await expect(readCredentials()).rejects.toThrow(/token/i)
  })

  it('rejects malformed JSON', async () => {
    await fs.mkdir(tmpDir, { recursive: true })
    await fs.writeFile(credentialsPath(), 'this is not json', 'utf8')
    await expect(readCredentials()).rejects.toThrow(/not valid JSON/)
  })

  it('overwrites existing credentials atomically (no temp files left behind)', async () => {
    await writeCredentials(VALID)
    await writeCredentials({ ...VALID, savedAt: '2026-05-20T00:00:00.000Z' })
    const back = await readCredentials()
    expect(back?.savedAt).toBe('2026-05-20T00:00:00.000Z')
    const dir = await fs.readdir(tmpDir)
    const tmpFiles = dir.filter((f) => f.includes('.tmp.'))
    expect(tmpFiles).toEqual([])
  })

  it('deleteCredentials removes the file', async () => {
    await writeCredentials(VALID)
    await deleteCredentials()
    expect(await readCredentials()).toBeNull()
  })

  it('deleteCredentials is idempotent when the file is absent', async () => {
    await expect(deleteCredentials()).resolves.toBeUndefined()
    await expect(deleteCredentials()).resolves.toBeUndefined()
  })
})
