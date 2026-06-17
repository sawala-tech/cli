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
    id: { type: 'string', description: 'Record id to unpublish.' },
  },
  required: ['collectionSlug', 'id'],
  additionalProperties: false,
}

export const datanaUnpublishRecordTool: ToolDefinition<Input> = {
  name: 'sawala_datana_unpublish_record',
  description:
    "Unpublish a Datana record (sets status='draft') without resending its body. Idempotent: " +
    'unpublishing an already-draft record is a no-op. Requires an active project.',
  inputSchema,
  annotations: {
    title: 'Unpublish Datana record',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
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
      { method: 'PATCH', body: { status: 'draft' } },
    )
  },
}
