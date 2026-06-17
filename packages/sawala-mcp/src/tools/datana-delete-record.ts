import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({ collectionSlug: z.string().min(1), id: z.string().min(1) })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    collectionSlug: { type: 'string', description: 'Slug of the collection the record belongs to.' },
    id: { type: 'string', description: 'Record id to delete.' },
  },
  required: ['collectionSlug', 'id'],
  additionalProperties: false,
}

export const datanaDeleteRecordTool: ToolDefinition<Input> = {
  name: 'sawala_datana_delete_record',
  description:
    'Delete a Datana record by id. This is irreversible — the row is removed, not unpublished. ' +
    'To merely hide a record from the public API, unpublish it instead. Requires an active project.',
  inputSchema,
  annotations: {
    title: 'Delete Datana record',
    readOnlyHint: false,
    destructiveHint: true,
    irreversibleHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    return await apiFetch<unknown>(
      ctx,
      `/cli/datana/projects/${encodeURIComponent(ctx.activeProjectId)}/collections/${encodeURIComponent(input.collectionSlug)}/records/${encodeURIComponent(input.id)}`,
      { method: 'DELETE' },
    )
  },
}
