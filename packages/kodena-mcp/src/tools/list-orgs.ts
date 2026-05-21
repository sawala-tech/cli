import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  EMPTY_INPUT_SCHEMA,
  emptyInputParser,
  type ToolDefinition,
} from './types'

interface OrgSummary {
  id: string
  slug: string
  name: string
}

export const listOrgsTool: ToolDefinition<Record<string, never>> = {
  name: 'kodena_list_orgs',
  description:
    'List every Sawala organisation the active user is a member of, with each org’s ' +
    'slug, name, and whether it’s the currently active one. Use when the user asks ' +
    '"what orgs do I have", "what teams am I in", or before switching org context. ' +
    'Takes no input.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: 'List orgs', readOnlyHint: true },
  parseInput: emptyInputParser,
  async handle(_input: Record<string, never>, ctx: CliContext) {
    const orgs = await apiFetch<OrgSummary[]>(ctx, '/me/orgs')
    return {
      activeOrg: ctx.activeOrg,
      scopeOrgSlug: ctx.scopeOrgSlug,
      orgs: orgs.map((o) => ({
        id: o.id,
        slug: o.slug,
        name: o.name,
        isActive: o.slug === ctx.activeOrg,
        isInTokenScope: ctx.scopeOrgSlug === null || ctx.scopeOrgSlug === o.slug,
      })),
    }
  },
}
