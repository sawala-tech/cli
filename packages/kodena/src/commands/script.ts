import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg } from '../lib/resolve'

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

export function createScriptCommand(): Command {
  const script = new Command('script').description('Browse scripts deployed to the active org.')

  script
    .command('list')
    .description('List every Kodena script in the active org.')
    .action(async () => {
      const ctx = await loadContext()
      requireActiveOrg(ctx)
      const scripts = await apiFetch<ScriptSummary[]>(ctx, '/kodena/scripts')

      if (scripts.length === 0) {
        process.stdout.write(`No scripts in '${ctx.activeOrg}'.\n`)
        return
      }

      for (const s of scripts) {
        const url = resolvePublicUrl(s)
        process.stdout.write(
          `  ${s.script_slug}  —  ${s.kind}  —  ${url}  —  updated ${s.modified_on}\n`,
        )
      }
    })

  return script
}

function resolvePublicUrl(s: ScriptSummary): string {
  if (s.custom_hostname) return `https://${s.custom_hostname}`
  return `https://${s.tenant_subdomain}.kodena.id`
}
