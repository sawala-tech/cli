import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({
    slug: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        fields: z.array(z.record(z.string(), z.unknown())).optional(),
        visibility: z.enum(['private', 'public']).optional(),
        pinned: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'Slug of the collection to update.' },
    patch: {
      type: 'object',
      description:
        'Replacement values: any of { name, slug, fields[], visibility, pinned }. Treated as a ' +
        'PUT — include the full `fields` array when changing fields.',
    },
  },
  required: ['slug', 'patch'],
  additionalProperties: false,
}

export const datanaUpdateCollectionTool: ToolDefinition<Input> = {
  name: 'sawala_datana_update_collection',
  description:
    'Update a Datana collection (PUT replacement). Pass the collection `slug` and a `patch` of ' +
    'the fields to change. Renaming the slug may 409 on conflict. Requires an active project.',
  inputSchema,
  annotations: { title: 'Update Datana collection', readOnlyHint: false },
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
      { method: 'PUT', body: input.patch },
    )
  },
}
