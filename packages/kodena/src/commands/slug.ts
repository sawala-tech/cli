import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg } from '../lib/resolve'
import { addContextOptions, contextOptions, type ContextOptions } from '../lib/command-options'

interface SlugAvailableResponse {
  available: boolean
  reason?: string
}

export function createSlugCommand(): Command {
  const slug = new Command('slug').description('Check script slug availability in the active org.')

  addContextOptions(
    slug
      .command('check')
      .argument('<slug>', 'The script slug to test.')
      .description('Is a script slug free in the active org? Exits non-zero when taken.'),
  ).action(async (value: string, opts: ContextOptions) => {
    const ctx = await loadContext(contextOptions(opts))
    // Slugs are unique per organisation, so only an active org is required.
    requireActiveOrg(ctx)
    const res = await apiFetch<SlugAvailableResponse>(
      ctx,
      `/kodena/scripts/slug-available?slug=${encodeURIComponent(value)}`,
    )
    if (res.available) {
      process.stdout.write(`"${value}" is available.\n`)
      return
    }
    process.stdout.write(`"${value}" is taken${res.reason ? ` (${res.reason})` : ''}.\n`)
    process.exitCode = 1
  })

  return slug
}
