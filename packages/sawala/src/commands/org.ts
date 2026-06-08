import { Command } from 'commander'
import prompts from 'prompts'
import {
  SAWALA_BRAND,
  apiFetch,
  loadContext,
  TokenScopeMismatchError,
  updateConfig,
  type CliContext,
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
    .command('use [slug]')
    .description(
      'Set the active organisation. Omit <slug> to choose interactively from the orgs your token can reach. Subsequent commands send `x-org-id` for this org.',
    )
    .action(async (slug: string | undefined) => {
      const ctx = await loadContext(SAWALA_BRAND)

      let target: string
      if (slug) {
        if (ctx.scopeOrgSlug && ctx.scopeOrgSlug !== slug) {
          throw new TokenScopeMismatchError(ctx.scopeOrgSlug, slug, SAWALA_BRAND)
        }

        const orgs = await apiFetch<OrgSummary[]>(ctx, '/cli/organization/me/orgs')
        if (orgs.length > 0 && !orgs.some((o) => o.slug === slug)) {
          const available = orgs.map((o) => o.slug).join(', ')
          throw new Error(`Not a member of org '${slug}'. Available: ${available}.`)
        }
        target = slug
      } else {
        const picked = await pickOrgInteractively(ctx)
        if (!picked) {
          process.stdout.write('Cancelled.\n')
          return
        }
        target = picked
      }

      await updateConfig(SAWALA_BRAND, { activeOrg: target })
      process.stdout.write(`Active org: ${target}\n`)
    })

  return org
}

/**
 * Resolve a target org slug interactively when no slug was passed.
 *
 * An org-scoped token can only ever target its one org, so there is nothing to
 * pick — it short-circuits to that org. A cross-org (all-orgs) token presents
 * the full membership list as a `prompts` selector, pre-selecting whatever org
 * is currently active. Returns null when the user cancels (or there is nothing
 * to choose); the caller treats that as a no-op.
 */
async function pickOrgInteractively(ctx: CliContext): Promise<string | null> {
  const orgs = await apiFetch<OrgSummary[]>(ctx, '/cli/organization/me/orgs')
  const allowed = ctx.scopeOrgSlug ? orgs.filter((o) => o.slug === ctx.scopeOrgSlug) : orgs

  if (allowed.length === 0) {
    if (ctx.scopeOrgSlug) return ctx.scopeOrgSlug
    throw new Error(
      'No organisations found for your account. Run `sawala org use <slug>` once access is granted.',
    )
  }
  if (allowed.length === 1) return allowed[0]!.slug

  if (!process.stdout.isTTY) {
    throw new Error(
      'No org slug given and not running interactively. Pass one: `sawala org use <slug>`.',
    )
  }

  const current = allowed.findIndex((o) => o.slug === ctx.activeOrg)
  const { picked } = await prompts({
    type: 'select',
    name: 'picked',
    message: 'Pick an active organisation',
    choices: allowed.map((o) => ({
      title: o.slug === ctx.activeOrg ? `${o.slug} — ${o.name} (current)` : `${o.slug} — ${o.name}`,
      value: o.slug,
    })),
    initial: current >= 0 ? current : 0,
  })

  return picked ? String(picked) : null
}
