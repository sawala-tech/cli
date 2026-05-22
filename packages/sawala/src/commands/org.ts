import { Command } from 'commander'
import {
  SAWALA_BRAND,
  apiFetch,
  loadContext,
  TokenScopeMismatchError,
  updateConfig,
} from '@sawala/auth'

export interface OrgSummary {
  id: string
  slug: string
  name: string
}

export function createOrgCommand(): Command {
  const org = new Command('org').description('Manage the active organisation context.')

  org
    .command('list')
    .description("List organisations you're a member of. The active org is marked '*'.")
    .action(async () => {
      const ctx = await loadContext(SAWALA_BRAND)
      const orgs = await apiFetch<OrgSummary[]>(ctx, '/cli/organization/me/orgs')

      if (orgs.length === 0) {
        process.stdout.write('No organisations found.\n')
        process.stdout.write(
          "If you know your org's slug, run `sawala org use <slug>` to set it directly.\n",
        )
        return
      }

      for (const o of orgs) {
        const isActive = o.slug === ctx.activeOrg
        const isOutOfScope =
          ctx.scopeOrgSlug !== null && ctx.scopeOrgSlug !== o.slug
        const marker = isActive ? '*' : ' '
        const suffix = isOutOfScope ? '  (not available with this token)' : ''
        process.stdout.write(`${marker} ${o.slug}  —  ${o.name}${suffix}\n`)
      }
    })

  org
    .command('use <slug>')
    .description('Set the active organisation. Subsequent commands send `x-org-id` for this org.')
    .action(async (slug: string) => {
      const ctx = await loadContext(SAWALA_BRAND)

      if (ctx.scopeOrgSlug && ctx.scopeOrgSlug !== slug) {
        throw new TokenScopeMismatchError(ctx.scopeOrgSlug, slug, SAWALA_BRAND)
      }

      const orgs = await apiFetch<OrgSummary[]>(ctx, '/cli/organization/me/orgs')
      if (orgs.length > 0) {
        const match = orgs.find((o) => o.slug === slug)
        if (!match) {
          const available = orgs.map((o) => o.slug).join(', ')
          throw new Error(`Not a member of org '${slug}'. Available: ${available}.`)
        }
      }

      await updateConfig(SAWALA_BRAND, { activeOrg: slug })
      process.stdout.write(`Active org: ${slug}\n`)
    })

  return org
}
