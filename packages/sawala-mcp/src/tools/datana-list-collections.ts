import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { EMPTY_INPUT_SCHEMA, emptyInputParser, type ToolDefinition } from './types'

interface CollectionRow {
  id: string
  slug: string
  name: string
  visibility: 'private' | 'public'
  pinned?: boolean
  [k: string]: unknown
}

interface CollectionListResponse {
  data: CollectionRow[]
  meta: { pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }
}

export const datanaListCollectionsTool: ToolDefinition<Record<string, never>> = {
  name: 'sawala_datana_list_collections',
  description:
    'List Datana collections in the active project. Datana is the Sawala structured-data ' +
    'platform: collections are typed data models, records are the rows inside them. Returns ' +
    'each collection’s slug, name, and visibility (private vs public-read). Takes no input; ' +
    'requires an active project.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: 'List Datana collections', readOnlyHint: true },
  parseInput: emptyInputParser,
  async handle(_input: Record<string, never>, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const result = await apiFetch<CollectionListResponse>(
      ctx,
      `/cli/datana/projects/${encodeURIComponent(ctx.activeProjectId)}/collections?limit=100`,
    )
    return {
      activeOrg: ctx.activeOrg,
      activeProject: ctx.activeProject,
      collections: result.data.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        visibility: c.visibility,
        pinned: c.pinned ?? false,
      })),
      pagination: result.meta.pagination,
    }
  },
}
