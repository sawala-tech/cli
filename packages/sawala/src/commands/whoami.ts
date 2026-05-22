import { Command } from 'commander'
import { SAWALA_BRAND, apiFetch, loadContext } from '@sawala/auth'

interface MeResponse {
  id: string
  email: string | null
  displayName: string | null
  orgId: string | null
  orgSlug: string | null
  tokenScope: {
    tokenId: string
    scopeOrgId: string | null
    scopeOrgSlug: string | null
    label: string
  } | null
}

export function createWhoamiCommand(): Command {
  return new Command('whoami')
    .description('Print the identity attached to the active CLI token.')
    .action(async () => {
      const ctx = await loadContext(SAWALA_BRAND)
      const me = await apiFetch<MeResponse>(ctx, '/cli/organization/me')

      const lines: Array<[string, string]> = [
        ['Email', me.email ?? '(none)'],
        ['Display name', me.displayName ?? '(none)'],
        ['Active org', ctx.activeOrg ?? '(not set)'],
        ['Active project', ctx.activeProject ?? '(not set)'],
        ['Token source', ctx.tokenSource],
      ]

      if (me.tokenScope) {
        const scopeLabel = me.tokenScope.scopeOrgSlug ?? 'All orgs'
        lines.push(['Token scope', `${scopeLabel} (label: "${me.tokenScope.label}")`])
      } else {
        lines.push(['Token scope', 'none (Clerk session)'])
      }

      const width = Math.max(...lines.map(([k]) => k.length))
      for (const [k, v] of lines) {
        process.stdout.write(`${k.padEnd(width)}  ${v}\n`)
      }
    })
}
