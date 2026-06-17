import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({
    collectionSlug: z.string().min(1),
    id: z.string().min(1),
    populate: z.string().optional(),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    collectionSlug: { type: 'string', description: 'Slug of the collection the record belongs to.' },
    id: { type: 'string', description: 'Record id to fetch.' },
    populate: {
      type: 'string',
      description: "Comma-separated relation field names to inline, or '*' for all relations.",
    },
  },
  required: ['collectionSlug', 'id'],
  additionalProperties: false,
}

export const datanaGetRecordTool: ToolDefinition<Input> = {
  name: 'sawala_datana_get_record',
  description:
    'Fetch one Datana record by id from a collection, optionally populating its relations inline. ' +
    'Requires an active project.',
  inputSchema,
  annotations: { title: 'Get Datana record', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const qs = input.populate ? `?populate=${encodeURIComponent(input.populate)}` : ''
    return await apiFetch<unknown>(
      ctx,
      `/cli/datana/projects/${encodeURIComponent(ctx.activeProjectId)}/collections/${encodeURIComponent(input.collectionSlug)}/records/${encodeURIComponent(input.id)}${qs}`,
    )
  },
}
