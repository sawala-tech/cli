import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readConfig, updateConfig, writeConfig } from '../src/lib/config'

let tmpDir: string
let originalConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'kodena-cfg-'))
  originalConfigDir = process.env['KODENA_CONFIG_DIR']
  process.env['KODENA_CONFIG_DIR'] = tmpDir
})

afterEach(async () => {
  if (originalConfigDir === undefined) delete process.env['KODENA_CONFIG_DIR']
  else process.env['KODENA_CONFIG_DIR'] = originalConfigDir
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('config', () => {
  it('returns empty config when no file exists', async () => {
    expect(await readConfig()).toEqual({ activeOrg: null, activeProject: null })
  })

  it('round-trips writes', async () => {
    await writeConfig({ activeOrg: 'acme', activeProject: 'blog' })
    expect(await readConfig()).toEqual({ activeOrg: 'acme', activeProject: 'blog' })
  })

  it('updateConfig merges partial updates', async () => {
    await writeConfig({ activeOrg: 'acme', activeProject: null })
    const next = await updateConfig({ activeProject: 'blog' })
    expect(next).toEqual({ activeOrg: 'acme', activeProject: 'blog' })
    expect(await readConfig()).toEqual({ activeOrg: 'acme', activeProject: 'blog' })
  })

  it('updateConfig clears a field when null is explicitly passed', async () => {
    await writeConfig({ activeOrg: 'acme', activeProject: 'blog' })
    const next = await updateConfig({ activeProject: null })
    expect(next.activeProject).toBeNull()
  })

  it('rejects malformed JSON', async () => {
    await fs.writeFile(join(tmpDir, 'config'), 'not json', 'utf8')
    await expect(readConfig()).rejects.toThrow(/not valid JSON/)
  })
})
