import { Command } from 'commander'
import prompts from 'prompts'
import {
  SAWALA_BRAND,
  apiFetch,
  loadContext,
  requireActiveOrg,
  updateConfig,
  type CliContext,
} from '@sawala/auth'

export interface ProjectRow {
  id: string
  slug: string
  name: string
  status?: string
}

interface PaginatedProjects {
  items: ProjectRow[]
  nextCursor: string | null
}

export function createProjectCommand(): Command {
  const project = new Command('project').description('Manage the active project context.')

  project
    .command('list')
    .description("List projects in the active org. The active project is marked '*'.")
    .action(async () => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)
      const result = await apiFetch<PaginatedProjects>(
        ctx,
        '/cli/organization/projects?limit=100',
      )

      if (result.items.length === 0) {
        process.stdout.write(`No projects in '${ctx.activeOrg}'.\n`)
        return
      }

      for (const p of result.items) {
        const isActive = p.slug === ctx.activeProject
        const marker = isActive ? '*' : ' '
        process.stdout.write(`${marker} ${p.slug}  —  ${p.name}\n`)
      }

      if (result.nextCursor) {
        process.stdout.write(
          '\n(more projects exist; pass `--project <slug>` directly if you need one beyond the first 100)\n',
        )
      }
    })

  project
    .command('use [slug]')
    .description(
      'Set the active project for the active org. Omit <slug> to choose interactively.',
    )
    .action(async (slug: string | undefined) => {
      const ctx = await loadContext(SAWALA_BRAND)
      requireActiveOrg(ctx, SAWALA_BRAND)

      const result = await apiFetch<PaginatedProjects>(
        ctx,
        '/cli/organization/projects?limit=100',
      )

      let match: ProjectRow | undefined
      if (slug) {
        match = result.items.find((p) => p.slug === slug)
        if (!match) {
          const available = result.items.map((p) => p.slug).join(', ') || '(none)'
          throw new Error(
            `Project '${slug}' not found in org '${ctx.activeOrg}'. Available: ${available}.`,
          )
        }
      } else {
        const picked = await pickProjectInteractively(ctx, result.items)
        if (!picked) {
          process.stdout.write('Cancelled.\n')
          return
        }
        match = picked
      }

      await updateConfig(SAWALA_BRAND, { activeProject: match.slug, activeProjectId: match.id })
      process.stdout.write(`Active project: ${match.slug}\n`)
    })

  return project
}

/**
 * Resolve a target project interactively when no slug was passed. Presents the
 * active org's projects as a `prompts` selector, pre-selecting the currently-
 * active project. Returns null when the user cancels; the caller treats that as
 * a no-op. A single project is auto-selected with no prompt.
 */
async function pickProjectInteractively(
  ctx: CliContext,
  items: ProjectRow[],
): Promise<ProjectRow | null> {
  if (items.length === 0) {
    throw new Error(
      `No projects in org '${ctx.activeOrg}'. Create one in the dashboard first.`,
    )
  }
  if (items.length === 1) return items[0]!

  if (!process.stdout.isTTY) {
    throw new Error(
      'No project slug given and not running interactively. Pass one: `sawala project use <slug>`.',
    )
  }

  const current = items.findIndex((p) => p.slug === ctx.activeProject)
  const { picked } = await prompts({
    type: 'select',
    name: 'picked',
    message: 'Pick an active project',
    choices: items.map((p) => ({
      title:
        p.slug === ctx.activeProject ? `${p.slug} — ${p.name} (current)` : `${p.slug} — ${p.name}`,
      value: p.slug,
    })),
    initial: current >= 0 ? current : 0,
  })

  if (!picked) return null
  return items.find((p) => p.slug === String(picked)) ?? null
}
