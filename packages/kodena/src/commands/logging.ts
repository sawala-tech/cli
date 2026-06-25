import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg, requireActiveProject } from '../lib/resolve'

// Response of GET/PATCH /kodena/scripts/:slug — the derived row carries
// logging_enabled (1/0). We only read the flag back for confirmation.
interface ScriptRow {
  script_slug: string
  logging_enabled?: number
}

/**
 * `kodena logging on|off <slug>` — toggle native Workers Logs capture for one
 * script WITHOUT a redeploy. Capture is off by default; turning it on makes the
 * script's console.* output and per-request summaries readable via
 * `kodena logs <slug>`. Changes take a few seconds to apply at the edge.
 *
 * Project-scoped like every script command: the backend resolves the slug with
 * getScriptBySlug(org, project, slug), so the active org AND project must be set.
 */
export function createLoggingCommand(): Command {
  const logging = new Command('logging').description(
    'Turn native Workers Logs capture on or off for a script (default off).',
  )

  for (const state of ['on', 'off'] as const) {
    logging
      .command(state)
      .argument('<slug>', 'The script slug.')
      .description(`Turn logging ${state} for a script.`)
      .action(async (slug: string) => {
        const ctx = await loadContext()
        requireActiveOrg(ctx)
        requireActiveProject(ctx)
        await apiFetch<ScriptRow>(ctx, `/kodena/scripts/${encodeURIComponent(slug)}/logging`, {
          method: 'PATCH',
          body: { enabled: state === 'on' },
        })
        process.stdout.write(
          `✓ Logging ${state} for ${slug}. Changes apply within a few seconds.\n` +
            (state === 'on' ? `  Read logs with: kodena logs ${slug}\n` : ''),
        )
      })
  }

  return logging
}
