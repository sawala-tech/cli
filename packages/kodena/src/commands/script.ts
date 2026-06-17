import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg, requireActiveProject } from '../lib/resolve'
import {
  addContextOptions,
  confirmDestructive,
  contextOptions,
  type ContextOptions,
} from '../lib/command-options'

// Response shape of `GET /kodena/scripts` — see
// sawala-cloud-core/services/kodena/src/types.ts (Script + withDerived).
// The backend serialises rows in snake_case and adds `tenant_subdomain`
// as a derived field on every row.
export interface ScriptSummary {
  script_slug: string
  org_handle: string
  tenant_subdomain: string
  custom_hostname: string | null
  kind: string
  created_on: string
  modified_on: string
}

// Response shape of `GET /kodena/scripts/:slug` after `withDerived()`. Mirrors
// the fields the kodena-mcp `get-script` tool consumes (snake_case throughout).
interface ScriptDetail {
  script_slug: string
  org_handle: string
  name: string
  custom_hostname: string | null
  kind: string
  assets_manifest_parsed?: unknown
  worker_module_size: number | null
  compatibility_date: string | null
  tenant_subdomain?: string
  created_on: string
  modified_on: string
}

type JsonOption = ContextOptions & { json?: boolean }
type YesOption = ContextOptions & { yes?: boolean }

export function createScriptCommand(): Command {
  const script = new Command('script').description('Browse and manage scripts in the active project.')

  script
    .command('list')
    .description('List every Kodena script in the active project.')
    .action(async () => {
      const ctx = await loadContext()
      // Scripts are project-scoped: the backend filters by org AND project, so
      // both must be active. apiFetch sends x-org-id / x-project-id from context.
      requireActiveOrg(ctx)
      requireActiveProject(ctx)
      const scripts = await apiFetch<ScriptSummary[]>(ctx, '/kodena/scripts')

      if (scripts.length === 0) {
        process.stdout.write(`No scripts in '${ctx.activeOrg}/${ctx.activeProject}'.\n`)
        return
      }

      for (const s of scripts) {
        const url = resolvePublicUrl(s)
        process.stdout.write(
          `  ${s.script_slug}  —  ${s.kind}  —  ${url}  —  updated ${s.modified_on}\n`,
        )
      }
    })

  addContextOptions(
    script
      .command('get')
      .argument('<slug>', 'The script slug to show.')
      .description('Show one script: name, kind, custom hostname, asset count, timestamps.')
      .option('--json', 'Print the raw JSON object instead of a readable block.'),
  ).action(async (slug: string, opts: JsonOption) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)
    const row = await apiFetch<ScriptDetail>(ctx, `/kodena/scripts/${encodeURIComponent(slug)}`)

    if (opts.json) {
      process.stdout.write(JSON.stringify(row, null, 2) + '\n')
      return
    }

    const assetCount = Array.isArray(row.assets_manifest_parsed)
      ? row.assets_manifest_parsed.length
      : null
    process.stdout.write(
      `  slug:            ${row.script_slug}\n` +
        `  name:            ${row.name || '—'}\n` +
        `  kind:            ${row.kind}\n` +
        `  url:             ${resolvePublicUrl(row)}\n` +
        `  custom hostname: ${row.custom_hostname ?? '—'}\n` +
        (assetCount !== null ? `  assets:          ${assetCount} file(s)\n` : '') +
        (row.worker_module_size != null ? `  worker size:     ${row.worker_module_size} bytes\n` : '') +
        `  compat date:     ${row.compatibility_date ?? '—'}\n` +
        `  created:         ${row.created_on}\n` +
        `  updated:         ${row.modified_on}\n`,
    )
  })

  addContextOptions(
    script
      .command('rename')
      .argument('<slug>', 'The script slug to rename.')
      .argument('<name>', 'New human-readable display name.')
      .description("Change a script's display name."),
  ).action(async (slug: string, name: string, opts: ContextOptions) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)
    await apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body: { name },
    })
    process.stdout.write(`Renamed ${slug} → "${name}".\n`)
  })

  addContextOptions(
    script
      .command('rehydrate')
      .argument('<slug>', 'The script slug to rehydrate.')
      .description('Rebuild the live worker from the stored bundle (no re-upload).'),
  ).action(async (slug: string, opts: ContextOptions) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)
    await apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}/rehydrate`, {
      method: 'POST',
    })
    process.stdout.write(`Rehydrated ${slug}.\n`)
  })

  addContextOptions(
    script
      .command('rm')
      .argument('<slug>', 'The script slug to delete. This cannot be undone.')
      .description('Delete a script (irreversible).')
      .option('--yes', 'Skip the confirmation prompt.'),
  ).action(async (slug: string, opts: YesOption) => {
    const ctx = await loadContext(contextOptions(opts))
    requireActiveOrg(ctx)
    requireActiveProject(ctx)

    const ok = await confirmDestructive(`Delete script ${slug}? This cannot be undone.`, opts.yes)
    if (!ok) {
      process.stdout.write('Aborted.\n')
      return
    }
    await apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}`, { method: 'DELETE' })
    process.stdout.write(`Deleted ${slug}.\n`)
  })

  return script
}

function resolvePublicUrl(s: { custom_hostname: string | null; tenant_subdomain?: string; script_slug?: string; org_handle?: string }): string {
  if (s.custom_hostname) return `https://${s.custom_hostname}`
  const sub = s.tenant_subdomain ?? `${s.script_slug ?? ''}-${s.org_handle ?? ''}`
  return `https://${sub}.kodena.id`
}
