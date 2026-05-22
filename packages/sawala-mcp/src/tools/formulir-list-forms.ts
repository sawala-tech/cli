import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import {
  EMPTY_INPUT_SCHEMA,
  emptyInputParser,
  type ToolDefinition,
} from './types'

interface FormRow {
  id: string
  slug: string
  name: string
  description: string | null
  version: number
  archivedAt: string | null
  [k: string]: unknown
}

interface FormListResponse {
  data: FormRow[]
  meta: { pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }
}

export const formulirListFormsTool: ToolDefinition<Record<string, never>> = {
  name: 'sawala_formulir_list_forms',
  description:
    'List forms in the active Sawala project. Formulir is the form-builder + ' +
    'submissions service in the Sawala suite: a form is a content model with a ' +
    '`fields` schema, and submissions are the user responses. Use this tool to ' +
    'discover which forms exist before reading submissions with ' +
    '`sawala_formulir_list_submissions` or `sawala_formulir_get_submission`. ' +
    'Takes no input.',
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: 'List Formulir forms', readOnlyHint: true },
  parseInput: emptyInputParser,
  async handle(_input: Record<string, never>, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const result = await apiFetch<FormListResponse>(
      ctx,
      `/cli/formulir/projects/${encodeURIComponent(ctx.activeProjectId)}/forms?limit=100`,
    )
    return {
      activeOrg: ctx.activeOrg,
      activeProject: ctx.activeProject,
      forms: result.data.map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        version: f.version,
        archivedAt: f.archivedAt,
      })),
      pagination: result.meta.pagination,
    }
  },
}
