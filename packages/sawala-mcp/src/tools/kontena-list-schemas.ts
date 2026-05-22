import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  EMPTY_INPUT_SCHEMA,
  emptyInputParser,
  type ToolDefinition,
} from './types'

interface SchemaRow {
  id: string
  documentId: string
  slug: string
  name: string
  type: 'single' | 'collection'
}

interface SchemaListResponse {
  data: SchemaRow[]
  meta: { pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }
}

export const kontenaListSchemasTool: ToolDefinition<Record<string, never>> = {
  name: 'sawala_kontena_list_schemas',
  description:
    'List the content schemas defined in the active Sawala project. Kontena is the ' +
    'lightweight content service in the Sawala suite: a schema is a content model (e.g. ' +
    '"Posts", "Products") and each schema holds many entries (the actual content items). ' +
    'Use this tool to discover which schemas exist before reading entries with ' +
    '`sawala_kontena_list_entries` or `sawala_kontena_get_entry`. Takes no input.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: 'List Kontena content schemas', readOnlyHint: true },
  parseInput: emptyInputParser,
  async handle(_input: Record<string, never>, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const result = await apiFetch<SchemaListResponse>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(ctx.activeProjectId)}/schemas?limit=100`,
    )
    return {
      activeOrg: ctx.activeOrg,
      activeProject: ctx.activeProject,
      schemas: result.data.map((s) => ({ slug: s.slug, name: s.name, type: s.type })),
    }
  },
}
