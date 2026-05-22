import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { loadContext, requireActiveOrg } from '../lib/resolve'

export interface ScriptSummary {
  slug: string
  orgHandle: string | null
  tenantSubdomain: string | null
  customHostname: string | null
  kind: string
  createdAt: string
  updatedAt: string
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
        const url = resolvePublicUrl(s) ?? '(no public url)'
        process.stdout.write(
          `  ${s.slug}  —  ${s.kind}  —  ${url}  —  updated ${s.updatedAt}\n`,
        )
      }
    })

  return script
}

function resolvePublicUrl(s: ScriptSummary): string | null {
  if (s.customHostname) return `https://${s.customHostname}`
  if (s.tenantSubdomain) return `https://${s.tenantSubdomain}.kodena.id`
  if (s.orgHandle) return `https://${s.slug}-${s.orgHandle}.kodena.id`
  return null
}
