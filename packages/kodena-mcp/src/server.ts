import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { loadContext } from './lib/auth'
import { KodenaErrorCode, toMcpError } from './lib/errors'
import { logger } from './lib/logger'
import { getPromptHandler, listPromptsHandler } from './prompts'
import {
  listResourceTemplatesHandler,
  listResourcesHandler,
  readResourceHandler,
} from './resources'
import { ALL_TOOLS, TOOLS_BY_NAME } from './tools'
import pkg from '../package.json'

const HELP_TEXT = [
  `kodena-mcp ${pkg.version}`,
  '',
  'Drive the Kodena API from any MCP-capable AI agent.',
  '',
  'Usage:',
  '  kodena-mcp                Start the MCP server on stdio.',
  '  kodena-mcp --help, -h     Show this help.',
  '  kodena-mcp --version, -v  Show the version.',
  '',
  'Authentication: the server reads ~/.kodena/credentials (written by',
  '`kodena login`) or $KODENA_API_TOKEN. Configure your MCP host',
  '(Claude Desktop, Claude Code, Cursor, ...) to spawn this binary over',
  'stdio. See https://github.com/sawala-tech/cli/tree/main/packages/kodena-mcp',
  'for host-specific configuration snippets.',
].join('\n')

export type ArgvResult =
  | { mode: 'help'; output: string }
  | { mode: 'version'; output: string }
  | { mode: 'serve' }

export function handleArgv(argv: readonly string[]): ArgvResult {
  const args = argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    return { mode: 'help', output: HELP_TEXT }
  }
  if (args.includes('--version') || args.includes('-v')) {
    return { mode: 'version', output: pkg.version }
  }
  return { mode: 'serve' }
}

export const listToolsHandler = async () => ({
  tools: ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: t.annotations,
  })),
})

export async function callToolHandler(request: {
  params: { name: string; arguments?: Record<string, unknown> | undefined }
}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { name, arguments: args } = request.params

  const tool = TOOLS_BY_NAME.get(name)
  if (!tool) {
    throw new McpError(
      KodenaErrorCode.InvalidInput,
      `Unknown tool '${name}'. Call tools/list to see what's available.`,
    )
  }

  try {
    const parsed = tool.parseInput(args ?? {})
    const ctx = await loadContext()
    const result = await tool.handle(parsed, ctx)
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    throw toMcpError(err)
  }
}

export function createServer(): Server {
  const server = new Server(
    { name: 'kodena-mcp', version: pkg.version },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, listToolsHandler)
  server.setRequestHandler(CallToolRequestSchema, callToolHandler)
  server.setRequestHandler(ListResourcesRequestSchema, listResourcesHandler)
  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    listResourceTemplatesHandler,
  )
  server.setRequestHandler(ReadResourceRequestSchema, readResourceHandler)
  server.setRequestHandler(ListPromptsRequestSchema, listPromptsHandler)
  server.setRequestHandler(GetPromptRequestSchema, getPromptHandler)

  return server
}

async function main(): Promise<void> {
  const result = handleArgv(process.argv)
  if (result.mode === 'help' || result.mode === 'version') {
    process.stdout.write(result.output + '\n')
    return
  }
  logger.info(`starting kodena-mcp ${pkg.version} (${ALL_TOOLS.length} tools)`)
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

if (require.main === module) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `kodena-mcp: fatal: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  })
}
