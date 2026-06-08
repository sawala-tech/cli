import { Command } from 'commander'
import prompts from 'prompts'
import { apiFetch } from '../lib/api'
import { updateConfig } from '../lib/config'
import { loadContext, TokenScopeMismatchError, type CliContext } from '../lib/resolve'

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
    .command('use [slug]')
    .description(
      'Set the active organisation. Omit <slug> to choose interactively from the orgs your token can reach. Subsequent commands send `x-org-id` for this org.',
    )
    .action(async (slug: string | undefined) => {
      const ctx = await loadContext()

      let target: string
      if (slug) {
        // Pre-flight: if the token is scoped, the target must match.
        if (ctx.scopeOrgSlug && ctx.scopeOrgSlug !== slug) {
          throw new TokenScopeMismatchError(ctx.scopeOrgSlug, slug)
        }

        // Validate membership by looking up the slug in the user's org list.
        // If /me/orgs returns [] (dev or backend missing), trust the user's
        // input and write the slug — downstream calls will fail informatively
        // if it's wrong.
        const orgs = await apiFetch<OrgSummary[]>(ctx, '/me/orgs')
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

      const changingOrg = target !== ctx.activeOrg
      await updateConfig({ activeOrg: target })
      process.stdout.write(`Active org: ${target}\n`)

      // Switching org invalidates the active project (it belonged to the old
      // org). Refresh it: auto-select a sole project, prompt when there are
      // several, otherwise clear it so nothing stale lingers.
      if (changingOrg) {
        const project = await resolveProjectForOrg(ctx, target)
        await updateConfig({ activeProject: project.slug, activeProjectId: project.id })
      }
    })

  return org
}

interface ProjectListResult {
  items: Array<{ id: string; slug: string; name: string }>
  nextCursor: string | null
}

/**
 * Pick the active project for a freshly-switched org. Returns the chosen
 * project's slug + id (both null when there is none, can't be resolved, or the
 * user skips the picker) — the org switch itself always succeeds regardless.
 */
async function resolveProjectForOrg(
  ctx: CliContext,
  orgSlug: string,
): Promise<{ slug: string | null; id: string | null }> {
  let items: ProjectListResult['items']
  try {
    const result = await apiFetch<ProjectListResult>(
      ctx,
      '/cli/organization/projects?limit=100',
      { orgOverride: orgSlug, projectOverride: null },
    )
    items = result.items
  } catch {
    // A projects-fetch hiccup must not block the org switch.
    return { slug: null, id: null }
  }

  if (items.length === 0) {
    process.stdout.write(
      `No projects in '${orgSlug}' yet — create one, then run \`kodena project use <slug>\`.\n`,
    )
    return { slug: null, id: null }
  }
  if (items.length === 1) {
    process.stdout.write(`Active project: ${items[0]!.slug}\n`)
    return { slug: items[0]!.slug, id: items[0]!.id }
  }

  if (!process.stdout.isTTY) {
    process.stdout.write(
      `'${orgSlug}' has ${items.length} projects — run \`kodena project use <slug>\` to pick one.\n`,
    )
    return { slug: null, id: null }
  }

  const { picked } = await prompts({
    type: 'select',
    name: 'picked',
    message: 'Pick an active project',
    choices: items.map((p) => ({ title: `${p.slug} — ${p.name}`, value: p.slug })),
    initial: 0,
  })
  if (!picked) {
    process.stdout.write('No project selected — run `kodena project use <slug>` to set one.\n')
    return { slug: null, id: null }
  }
  const match = items.find((p) => p.slug === String(picked))
  if (match) process.stdout.write(`Active project: ${match.slug}\n`)
  return { slug: match?.slug ?? null, id: match?.id ?? null }
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
  const orgs = await apiFetch<OrgSummary[]>(ctx, '/me/orgs')
  // A scoped token is pinned to one org — picking is moot.
  const allowed = ctx.scopeOrgSlug ? orgs.filter((o) => o.slug === ctx.scopeOrgSlug) : orgs

  if (allowed.length === 0) {
    // Scoped token whose org didn't come back from /me/orgs (e.g. a Clerk-sync
    // hiccup) — trust the token's scope claim rather than failing.
    if (ctx.scopeOrgSlug) return ctx.scopeOrgSlug
    throw new Error(
      'No organisations found for your account. Run `kodena org use <slug>` once access is granted.',
    )
  }
  if (allowed.length === 1) return allowed[0]!.slug

  if (!process.stdout.isTTY) {
    throw new Error(
      'No org slug given and not running interactively. Pass one: `kodena org use <slug>`.',
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
