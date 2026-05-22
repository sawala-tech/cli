import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KODENA_BRAND, SAWALA_BRAND, type Brand } from '../src/brand'
import { resolveApiBase } from '../src/api-base'

describe.each([KODENA_BRAND, SAWALA_BRAND] as Brand[])(
  'resolveApiBase for $name',
  (brand) => {
    let originalEnv: string | undefined

    beforeEach(() => {
      originalEnv = process.env[brand.apiBaseEnvVar]
      delete process.env[brand.apiBaseEnvVar]
    })

    afterEach(() => {
      if (originalEnv === undefined) delete process.env[brand.apiBaseEnvVar]
      else process.env[brand.apiBaseEnvVar] = originalEnv
    })

    it('falls back to the production default with no override and no env', () => {
      expect(resolveApiBase(brand)).toBe('https://api.sawala.cloud')
    })

    it(`uses ${brand.apiBaseEnvVar} when set`, () => {
      process.env[brand.apiBaseEnvVar] = 'https://api.dev.sawala.cloud/'
      expect(resolveApiBase(brand)).toBe('https://api.dev.sawala.cloud')
    })

    it('explicit override beats env', () => {
      process.env[brand.apiBaseEnvVar] = 'https://api.dev.sawala.cloud'
      expect(resolveApiBase(brand, 'https://api.staging.sawala.cloud/')).toBe(
        'https://api.staging.sawala.cloud',
      )
    })

    it('strips trailing slashes', () => {
      expect(resolveApiBase(brand, 'https://example.com/')).toBe('https://example.com')
    })
  },
)
