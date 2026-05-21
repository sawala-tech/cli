import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
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

export const listToolsHandler = async (): Promise<{ tools: [] }> => ({ tools: [] })

export function createServer(): Server {
  const server = new Server(
    { name: 'kodena-mcp', version: pkg.version },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, listToolsHandler)

  return server
}

async function main(): Promise<void> {
  const result = handleArgv(process.argv)
  if (result.mode === 'help' || result.mode === 'version') {
    process.stdout.write(result.output + '\n')
    return
  }
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

if (require.main === module) {
  main().catch((err: unknown) => {
    process.stderr.write(`kodena-mcp: fatal: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
