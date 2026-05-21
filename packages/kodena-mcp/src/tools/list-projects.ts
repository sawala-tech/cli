import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  EMPTY_INPUT_SCHEMA,
  emptyInputParser,
  type ToolDefinition,
} from './types'

interface ProjectSummary {
  id: string
  slug: string
  name: string
  orgId: string
  createdAt: string
}

interface PaginatedProjects {
  items: ProjectSummary[]
  nextCursor: string | null
}

export const listProjectsTool: ToolDefinition<Record<string, never>> = {
  name: 'kodena_list_projects',
  description:
    'List projects in the active organisation. A "project" is a Sawala-level grouping ' +
    'of scripts; it controls which `x-project-id` subsequent calls send. Use this when ' +
    'the user asks "what projects do I have" or before switching project context. ' +
    'Requires an active org (set via `kodena org use` or the KODENA_ORG env var). ' +
    'Takes no input.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: 'List projects', readOnlyHint: true },
  parseInput: emptyInputParser,
  async handle(_input: Record<string, never>, ctx: CliContext) {
    const result = await apiFetch<PaginatedProjects>(ctx, '/projects?limit=100')
    return {
      activeOrg: ctx.activeOrg,
      activeProject: ctx.activeProject,
      projects: result.items.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        isActive: p.slug === ctx.activeProject,
        createdAt: p.createdAt,
      })),
      nextCursor: result.nextCursor,
    }
  },
}
