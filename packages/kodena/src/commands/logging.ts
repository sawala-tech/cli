import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg, requireActiveProject } from '../lib/resolve'

// Response of PATCH /kodena/scripts/:slug/logging — the derived row carries the
// logging level + mode; we read it back only for confirmation.
interface ScriptRow {
  script_slug: string
  logging_enabled?: number
  logging_mode?: string
}

type LoggingMode = 'off' | 'console' | 'all'

const MODES: Array<{ mode: LoggingMode; summary: string }> = [
  { mode: 'off', summary: 'no logs captured' },
  { mode: 'console', summary: "the script's console.* output only" },
  { mode: 'all', summary: 'console output + a summary line for every request' },
]

/**
 * `kodena logging off|console|all <slug>` — set native Workers Logs capture for
 * one script WITHOUT a redeploy. Capture is off by default.
 *   off     → no logs captured
 *   console → the script's console.* output only
 *   all     → console output + a per-request summary line
 * Turning capture on makes the output readable via `kodena logs <slug>`.
 * Changes take a few seconds to apply at the edge.
 *
 * Project-scoped like every script command: the backend resolves the slug with
 * getScriptBySlug(org, project, slug), so the active org AND project must be set.
 */
export function createLoggingCommand(): Command {
  const logging = new Command('logging').description(
    'Set native Workers Logs capture for a script: off | console | all (default off).',
  )

  for (const { mode, summary } of MODES) {
    logging
      .command(mode)
      .argument('<slug>', 'The script slug.')
      .description(`Set logging to "${mode}" — ${summary}.`)
      .action(async (slug: string) => {
        const ctx = await loadContext()
        requireActiveOrg(ctx)
        requireActiveProject(ctx)
        await apiFetch<ScriptRow>(ctx, `/kodena/scripts/${encodeURIComponent(slug)}/logging`, {
          method: 'PATCH',
          body: { mode },
        })
        process.stdout.write(
          `✓ Logging set to "${mode}" for ${slug}. Changes apply within a few seconds.\n` +
            (mode !== 'off' ? `  Read logs with: kodena logs ${slug}\n` : ''),
        )
      })
  }

  return logging
}
