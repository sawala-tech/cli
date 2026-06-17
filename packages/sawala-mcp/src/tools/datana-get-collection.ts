import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z.object({ slug: z.string().min(1) }).strict()
type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'Slug of the collection to fetch.' },
  },
  required: ['slug'],
  additionalProperties: false,
}

export const datanaGetCollectionTool: ToolDefinition<Input> = {
  name: 'sawala_datana_get_collection',
  description:
    'Fetch one Datana collection by slug, including its typed field definitions and ' +
    'visibility. Use before creating or querying records so you know the collection’s ' +
    'fields. Requires an active project.',
  inputSchema,
  annotations: { title: 'Get Datana collection', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    return await apiFetch<unknown>(
      ctx,
      `/cli/datana/projects/${encodeURIComponent(ctx.activeProjectId)}/collections/${encodeURIComponent(input.slug)}`,
    )
  },
}
