import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpError } from '@modelcontextprotocol/sdk/types.js'
import pkg from '../package.json'
import {
  callToolHandler,
  createServer,
  handleArgv,
  listToolsHandler,
} from '../src/server'
import { SawalaErrorCode } from '../src/lib/errors'

describe('handleArgv', () => {
  it('returns help mode when --help is passed', () => {
    const result = handleArgv(['node', 'sawala-mcp', '--help'])
    expect(result.mode).toBe('help')
    if (result.mode === 'help') {
      expect(result.output).toContain('Drive the Sawala API from any MCP-capable AI agent.')
      expect(result.output).toContain('sawala-mcp')
    }
  })

  it('returns help mode for the -h short flag', () => {
    const result = handleArgv(['node', 'sawala-mcp', '-h'])
    expect(result.mode).toBe('help')
  })

  it('returns version mode when --version is passed', () => {
    const result = handleArgv(['node', 'sawala-mcp', '--version'])
    expect(result.mode).toBe('version')
    if (result.mode === 'version') {
      expect(result.output).toBe(pkg.version)
    }
  })

  it('returns version mode for the -v short flag', () => {
    const result = handleArgv(['node', 'sawala-mcp', '-v'])
    expect(result.mode).toBe('version')
  })

  it('returns serve mode with no flags', () => {
    const result = handleArgv(['node', 'sawala-mcp'])
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
  it('includes sawala_whoami', async () => {
    const result = await listToolsHandler()
    const names = result.tools.map((t) => t.name)
    expect(names).toContain('sawala_whoami')
  })

  it('advertises every registered tool with name/description/inputSchema/annotations', async () => {
    const result = await listToolsHandler()
    expect(result.tools.length).toBeGreaterThanOrEqual(1)
    for (const tool of result.tools) {
      expect(tool.name).toMatch(/^sawala_/)
      expect(typeof tool.description).toBe('string')
      expect(tool.inputSchema.type).toBe('object')
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean')
    }
  })
})

describe('callToolHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env['SAWALA_API_TOKEN']
    delete process.env['SAWALA_CONFIG_DIR']
  })

  it('returns -32602 InvalidInput when the tool name is unknown', async () => {
    await expect(
      callToolHandler({ params: { name: 'nope', arguments: {} } }),
    ).rejects.toMatchObject({
      code: SawalaErrorCode.InvalidInput,
    })
  })

  it('returns -32001 Unauthenticated when no token is configured', async () => {
    process.env['SAWALA_CONFIG_DIR'] = '/tmp/sawala-mcp-test-nonexistent-' + Date.now()
    await expect(
      callToolHandler({ params: { name: 'sawala_whoami', arguments: {} } }),
    ).rejects.toMatchObject({
      code: SawalaErrorCode.Unauthenticated,
    })
  })

  it('wraps a successful tool result in the MCP { content: [...] } envelope', async () => {
    process.env['SAWALA_API_TOKEN'] = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    process.env['SAWALA_CONFIG_DIR'] = '/tmp/sawala-mcp-test-nonexistent-' + Date.now()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'u',
              email: 'e',
              displayName: null,
              orgId: null,
              orgSlug: null,
              tokenScope: null,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )
    const result = await callToolHandler({
      params: { name: 'sawala_whoami', arguments: {} },
    })
    expect(result.content[0]?.type).toBe('text')
    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed.email).toBe('e')
  })

  it('reports input-schema violations as McpError InvalidInput', async () => {
    process.env['SAWALA_API_TOKEN'] = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    await expect(
      callToolHandler({
        params: { name: 'sawala_whoami', arguments: { extra: 'nope' } },
      }),
    ).rejects.toBeInstanceOf(McpError)
  })
})
