import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { createServer, handleArgv, listToolsHandler } from '../src/server'

describe('handleArgv', () => {
  it('returns help mode when --help is passed', () => {
    const result = handleArgv(['node', 'kodena-mcp', '--help'])
    expect(result.mode).toBe('help')
    if (result.mode === 'help') {
      expect(result.output).toContain('Drive the Kodena API from any MCP-capable AI agent.')
      expect(result.output).toContain('kodena-mcp')
    }
  })

  it('returns help mode for the -h short flag', () => {
    const result = handleArgv(['node', 'kodena-mcp', '-h'])
    expect(result.mode).toBe('help')
  })

  it('returns version mode when --version is passed', () => {
    const result = handleArgv(['node', 'kodena-mcp', '--version'])
    expect(result.mode).toBe('version')
    if (result.mode === 'version') {
      expect(result.output).toBe(pkg.version)
    }
  })

  it('returns version mode for the -v short flag', () => {
    const result = handleArgv(['node', 'kodena-mcp', '-v'])
    expect(result.mode).toBe('version')
  })

  it('returns serve mode with no flags', () => {
    const result = handleArgv(['node', 'kodena-mcp'])
    expect(result.mode).toBe('serve')
  })
})

describe('createServer', () => {
  it('constructs an MCP Server without throwing', () => {
    const server = createServer()
    expect(server).toBeDefined()
  })
})

describe('listToolsHandler', () => {
  it('returns an empty tools array (no tools registered in M1)', async () => {
    const result = await listToolsHandler()
    expect(result).toEqual({ tools: [] })
  })
})
