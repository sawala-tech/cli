import { describe, expect, it } from 'vitest'
import { McpError } from '@modelcontextprotocol/sdk/types.js'
import { ApiError } from '../src/lib/api-client'
import { NotLoggedInError, TokenScopeMismatchError } from '../src/lib/auth'
import { KodenaErrorCode, toMcpError } from '../src/lib/errors'

describe('toMcpError', () => {
  it('passes McpError through unchanged', () => {
    const original = new McpError(KodenaErrorCode.Generic, 'already mapped')
    expect(toMcpError(original)).toBe(original)
  })

  it('maps NotLoggedInError to -32001 with a "run kodena login" message', () => {
    const result = toMcpError(new NotLoggedInError())
    expect(result.code).toBe(KodenaErrorCode.Unauthenticated)
    expect(result.message).toMatch(/kodena login/)
  })

  it('maps TokenScopeMismatchError to -32003 forbidden', () => {
    const err = new TokenScopeMismatchError('acme', 'globex')
    const result = toMcpError(err)
    expect(result.code).toBe(KodenaErrorCode.Forbidden)
  })

  it('maps ApiError 401 to -32001', () => {
    const result = toMcpError(new ApiError(401, { error: 'bad token' }, 'https://x/me'))
    expect(result.code).toBe(KodenaErrorCode.Unauthenticated)
  })

  it('maps ApiError 403 to -32003', () => {
    const result = toMcpError(new ApiError(403, { error: 'forbidden' }, 'https://x/x'))
    expect(result.code).toBe(KodenaErrorCode.Forbidden)
  })

  it('maps ApiError 404 to -32002', () => {
    const result = toMcpError(new ApiError(404, { error: 'not found' }, 'https://x/x'))
    expect(result.code).toBe(KodenaErrorCode.NotFound)
  })

  it('maps ApiError 500 to -32000 generic', () => {
    const result = toMcpError(new ApiError(500, { error: 'boom' }, 'https://x/x'))
    expect(result.code).toBe(KodenaErrorCode.Generic)
  })

  it('maps an unknown thrown value to -32000 with its String() form', () => {
    const result = toMcpError(new Error('something else'))
    expect(result.code).toBe(KodenaErrorCode.Generic)
    expect(result.message).toMatch(/something else/)
  })
})
