import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveApiBase } from '../src/lib/api-base'

let originalEnv: string | undefined

beforeEach(() => {
  originalEnv = process.env['KODENA_API_BASE']
  delete process.env['KODENA_API_BASE']
})

afterEach(() => {
  if (originalEnv === undefined) delete process.env['KODENA_API_BASE']
  else process.env['KODENA_API_BASE'] = originalEnv
})

describe('resolveApiBase', () => {
  it('falls back to the production default with no override and no env', () => {
    expect(resolveApiBase()).toBe('https://api.sawala.cloud')
  })

  it('uses the env variable when set', () => {
    process.env['KODENA_API_BASE'] = 'https://api.dev.sawala.cloud/'
    expect(resolveApiBase()).toBe('https://api.dev.sawala.cloud')
  })

  it('explicit override beats env', () => {
    process.env['KODENA_API_BASE'] = 'https://api.dev.sawala.cloud'
    expect(resolveApiBase('https://api.staging.sawala.cloud/')).toBe(
      'https://api.staging.sawala.cloud',
    )
  })

  it('strips trailing slashes', () => {
    expect(resolveApiBase('https://example.com/')).toBe('https://example.com')
  })
})
