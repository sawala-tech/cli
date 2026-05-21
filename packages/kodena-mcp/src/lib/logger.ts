/**
 * stderr-only logger.
 *
 * stdout is reserved for JSON-RPC frames in stdio mode; any stray
 * stdout write corrupts the protocol stream and the host disconnects.
 * Everything human-readable — diagnostics, request traces, warnings —
 * goes to stderr where the host's MCP log panel surfaces it.
 */

function format(level: string, message: string, extra: unknown): string {
  const ts = new Date().toISOString()
  const tail = extra === undefined ? '' : ` ${safeStringify(extra)}`
  return `[kodena-mcp] ${ts} ${level} ${message}${tail}\n`
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const logger = {
  info(message: string, extra?: unknown): void {
    process.stderr.write(format('INFO ', message, extra))
  },
  warn(message: string, extra?: unknown): void {
    process.stderr.write(format('WARN ', message, extra))
  },
  error(message: string, extra?: unknown): void {
    process.stderr.write(format('ERROR', message, extra))
  },
}
