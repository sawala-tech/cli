import type { Command } from 'commander'
import prompts from 'prompts'

/**
 * The standard per-command context overrides, mirroring `kodena deploy`
 * (`--org`, `--project`, `--token`, `--api-base`). Every command that resolves
 * a context should accept these so a single invocation can target a different
 * org/project/token without changing the saved config.
 */
export interface ContextOptions {
  org?: string
  project?: string
  token?: string
  apiBase?: string
}

export function addContextOptions(cmd: Command): Command {
  return cmd
    .option('--org <slug>', 'Override the active org for this command only.')
    .option('--project <slug>', 'Override the active project for this command only.')
    .option('--token <koda_…>', 'Use this CLI token instead of the resolved one.')
    .option('--api-base <url>', 'Override the API base URL.')
}

/** Map the parsed flags into the `CliOptions` shape `loadContext` expects. */
export function contextOptions(opts: ContextOptions): {
  token: string | undefined
  org: string | undefined
  project: string | undefined
  apiBase: string | undefined
} {
  return { token: opts.token, org: opts.org, project: opts.project, apiBase: opts.apiBase }
}

/**
 * Confirm a destructive action. Returns true to proceed.
 * - `--yes` skips the prompt.
 * - In a non-interactive shell without `--yes`, refuses (returns false) rather
 *   than silently destroying.
 */
export async function confirmDestructive(message: string, yes: boolean | undefined): Promise<boolean> {
  if (yes) return true
  if (!process.stdin.isTTY) return false
  const { ok } = await prompts({ type: 'confirm', name: 'ok', message, initial: false })
  return Boolean(ok)
}
