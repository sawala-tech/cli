import { Command } from 'commander'
import { apiFetch } from '../lib/api'
import { updateConfig } from '../lib/config'
import { loadContext, requireActiveOrg } from '../lib/resolve'

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
      const ctx = await loadContext()
      requireActiveOrg(ctx)
      const result = await apiFetch<PaginatedProjects>(ctx, '/projects?limit=100')

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
    .command('use <slug>')
    .description('Set the active project for the active org.')
    .action(async (slug: string) => {
      const ctx = await loadContext()
      requireActiveOrg(ctx)

      const result = await apiFetch<PaginatedProjects>(ctx, '/projects?limit=100')
      const match = result.items.find((p) => p.slug === slug)
      if (!match) {
        const available = result.items.map((p) => p.slug).join(', ') || '(none)'
        throw new Error(
          `Project '${slug}' not found in org '${ctx.activeOrg}'. Available: ${available}.`,
        )
      }

      await updateConfig({ activeProject: slug })
      process.stdout.write(`Active project: ${slug}\n`)
    })

  return project
}
