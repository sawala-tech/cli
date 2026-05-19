import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { updateConfig } from '../lib/config'
import { loadContext, TokenScopeMismatchError } from '../lib/resolve'

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
      const ctx = await loadContext()
      const orgs = await apiFetch<OrgSummary[]>(ctx, '/me/orgs')

      if (orgs.length === 0) {
        process.stdout.write('No organisations found.\n')
        process.stdout.write(
          "If you know your org's slug, run `kodena org use <slug>` to set it directly.\n",
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
      const ctx = await loadContext()

      // Pre-flight: if the token is scoped, the target must match.
      if (ctx.scopeOrgSlug && ctx.scopeOrgSlug !== slug) {
        throw new TokenScopeMismatchError(ctx.scopeOrgSlug, slug)
      }

      // Validate membership by looking up the slug in the user's org list.
      // If /me/orgs returns [] (dev or backend missing), trust the user's
      // input and write the slug — downstream calls will fail informatively
      // if it's wrong.
      const orgs = await apiFetch<OrgSummary[]>(ctx, '/me/orgs')
      if (orgs.length > 0) {
        const match = orgs.find((o) => o.slug === slug)
        if (!match) {
          const available = orgs.map((o) => o.slug).join(', ')
          throw new Error(`Not a member of org '${slug}'. Available: ${available}.`)
        }
      }

      await updateConfig({ activeOrg: slug })
      process.stdout.write(`Active org: ${slug}\n`)
    })

  return org
}
