import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KODENA_BRAND, SAWALA_BRAND, type Brand } from '../src/brand'
import { configDir } from '../src/paths'

describe.each([KODENA_BRAND, SAWALA_BRAND] as Brand[])(
  'configDir for $name',
  (brand) => {
    let originalOverride: string | undefined

    beforeEach(() => {
      originalOverride = process.env[brand.configDirEnvVar]
      delete process.env[brand.configDirEnvVar]
    })

    afterEach(() => {
      if (originalOverride === undefined) delete process.env[brand.configDirEnvVar]
      else process.env[brand.configDirEnvVar] = originalOverride
    })

    it(`defaults to ~/${brand.configDirName} with no env override`, () => {
      expect(configDir(brand)).toBe(join(homedir(), brand.configDirName))
    })

    it('honours the env override verbatim', () => {
      process.env[brand.configDirEnvVar] = '/tmp/custom-dir'
      expect(configDir(brand)).toBe('/tmp/custom-dir')
    })

    it('ignores an empty env override', () => {
      process.env[brand.configDirEnvVar] = ''
      expect(configDir(brand)).toBe(join(homedir(), brand.configDirName))
    })
  },
)
