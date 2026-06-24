import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg, requireActiveProject } from '../lib/resolve'
import {
  addContextOptions,
  contextOptions,
  type ContextOptions,
} from '../lib/command-options'

// One normalized native-log event, as returned by the kodena backend's
// `GET /kodena/scripts/:slug/logs` (see sawala-cloud-core
// services/kodena/src/resource.ts → ScriptLogEvent).
interface ScriptLogEvent {
  timestamp: string
  level: string
  message: string
  rayId: string | null
}

type LogsOptions = ContextOptions & {
  since?: string
  level?: string
  json?: boolean
}

const LEVELS = ['log', 'error', 'warn', 'info', 'debug']

export function createLogsCommand(): Command {
  const logs = addContextOptions(
    new Command('logs')
      .argument('<slug>', 'The script slug whose logs to read.')
      .description("Show recent native Workers Logs for one of the active project's scripts.")
      .option(
        '--since <window>',
        'How far back to read: e.g. 15m, 2h, 1d (default 1h; max 3d retention).',
      )
      .option('--level <level>', `Only this level: ${LEVELS.join(' | ')}.`)
      .option('--json', 'Print the raw events as JSON instead of one line each.'),
  )

  logs.action(async (slug: string, opts: LogsOptions) => {
    if (opts.level && !LEVELS.includes(opts.level.toLowerCase())) {
      process.stderr.write(`Invalid --level '${opts.level}'. Use one of: ${LEVELS.join(', ')}.\n`)
      process.exitCode = 1
      return
    }

    const ctx = await loadContext(contextOptions(opts))
    // Scripts are project-scoped: the backend resolves the slug to a row owned
    // by the active org AND project before reading its logs, so both must be
    // active. apiFetch sends x-org-id / x-project-id from the context.
    requireActiveOrg(ctx)
    requireActiveProject(ctx)

    const qs = new URLSearchParams()
    if (opts.since) qs.set('since', opts.since)
    if (opts.level) qs.set('level', opts.level.toLowerCase())
    const suffix = qs.toString() ? `?${qs.toString()}` : ''

    const { events } = await apiFetch<{ events: ScriptLogEvent[] }>(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/logs${suffix}`,
    )

    if (opts.json) {
      process.stdout.write(JSON.stringify(events, null, 2) + '\n')
      return
    }

    if (events.length === 0) {
      const windowLabel = opts.since ?? 'last 1h'
      process.stdout.write(`No logs for '${slug}' in the selected window (${windowLabel}).\n`)
      return
    }

    for (const e of events) {
      const ray = e.rayId ? `  [${e.rayId}]` : ''
      process.stdout.write(`  ${e.timestamp}  ${e.level.padEnd(5)}  ${e.message}${ray}\n`)
    }
  })

  return logs
}
