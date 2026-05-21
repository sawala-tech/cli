import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpError } from '@modelcontextprotocol/sdk/types.js'
import pkg from '../package.json'
import {
  callToolHandler,
  createServer,
  handleArgv,
  listToolsHandler,
} from '../src/server'
import { KodenaErrorCode } from '../src/lib/errors'

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
  it('advertises every registered tool with name/description/inputSchema/annotations', async () => {
    const result = await listToolsHandler()
    expect(result.tools.length).toBeGreaterThanOrEqual(18)
    for (const tool of result.tools) {
      expect(tool.name).toMatch(/^kodena_/)
      expect(typeof tool.description).toBe('string')
      expect(tool.inputSchema.type).toBe('object')
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean')
    }
  })
})

describe('callToolHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env['KODENA_API_TOKEN']
    delete process.env['KODENA_CONFIG_DIR']
  })

  it('returns -32602 InvalidInput when the tool name is unknown', async () => {
    await expect(
      callToolHandler({ params: { name: 'nope', arguments: {} } }),
    ).rejects.toMatchObject({
      code: KodenaErrorCode.InvalidInput,
    })
  })

  it('returns -32001 Unauthenticated when no token is configured', async () => {
    process.env['KODENA_CONFIG_DIR'] = '/tmp/kodena-mcp-test-nonexistent-' + Date.now()
    await expect(
      callToolHandler({ params: { name: 'kodena_whoami', arguments: {} } }),
    ).rejects.toMatchObject({
      code: KodenaErrorCode.Unauthenticated,
    })
  })

  it('wraps a successful tool result in the MCP { content: [...] } envelope', async () => {
    process.env['KODENA_API_TOKEN'] = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    process.env['KODENA_CONFIG_DIR'] = '/tmp/kodena-mcp-test-nonexistent-' + Date.now()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: 'u', email: 'e', displayName: null, orgId: null, orgSlug: null, tokenScope: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const result = await callToolHandler({
      params: { name: 'kodena_whoami', arguments: {} },
    })
    expect(result.content[0]?.type).toBe('text')
    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed.email).toBe('e')
  })

  it('reports input-schema violations as McpError InvalidInput', async () => {
    process.env['KODENA_API_TOKEN'] = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    await expect(
      callToolHandler({
        params: { name: 'kodena_get_script', arguments: { slug: '' } },
      }),
    ).rejects.toBeInstanceOf(McpError)
  })
})
