import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KODENA_BRAND, SAWALA_BRAND, type Brand } from '../src/brand'
import { resolveApiBase, isSecureApiBase } from '../src/api-base'

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

    it('rejects a non-https override (token would travel in cleartext)', () => {
      expect(() => resolveApiBase(brand, 'http://evil.example.com')).toThrow(/insecure API base/)
    })

    it('rejects a non-https env value', () => {
      process.env[brand.apiBaseEnvVar] = 'http://evil.example.com'
      expect(() => resolveApiBase(brand)).toThrow(/insecure API base/)
    })

    it('allows http only for localhost / loopback', () => {
      expect(resolveApiBase(brand, 'http://localhost:8787')).toBe('http://localhost:8787')
      expect(resolveApiBase(brand, 'http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
    })
  },
)

describe('isSecureApiBase', () => {
  it('accepts https anywhere', () => {
    expect(isSecureApiBase('https://api.sawala.cloud')).toBe(true)
  })
  it('accepts http only for loopback', () => {
    expect(isSecureApiBase('http://localhost:3000')).toBe(true)
    expect(isSecureApiBase('http://127.0.0.1')).toBe(true)
    expect(isSecureApiBase('http://api.local.localhost')).toBe(true)
  })
  it('rejects http to a non-loopback host', () => {
    expect(isSecureApiBase('http://api.sawala.cloud')).toBe(false)
    expect(isSecureApiBase('http://127.0.0.1.evil.com')).toBe(false)
  })
  it('rejects malformed / non-http(s) schemes', () => {
    expect(isSecureApiBase('not a url')).toBe(false)
    expect(isSecureApiBase('ftp://example.com')).toBe(false)
    expect(isSecureApiBase('file:///etc/passwd')).toBe(false)
  })
})
