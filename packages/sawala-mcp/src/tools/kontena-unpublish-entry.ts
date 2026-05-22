import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({
    schemaSlug: z.string().min(1),
    slugOrId: z.string().min(1),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    schemaSlug: {
      type: 'string',
      description: 'Slug of the collection schema the entry belongs to.',
    },
    slugOrId: {
      type: 'string',
      description: 'Entry ULID or slug to unpublish.',
    },
  },
  required: ['schemaSlug', 'slugOrId'],
  additionalProperties: false,
}

export const kontenaUnpublishEntryTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_unpublish_entry',
  description:
    "Unpublish a Kontena collection entry (sets `status='draft'`). Idempotent. v1 supports collection " +
    'schemas only; for single-type schemas use `sawala_kontena_update_entry`.',
  inputSchema,
  annotations: {
    title: 'Unpublish Kontena entry',
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
      `/cli/kontena/projects/${encodeURIComponent(ctx.activeProjectId)}/content/collection/${encodeURIComponent(input.schemaSlug)}/${encodeURIComponent(input.slugOrId)}`,
      { method: 'PUT', body: { status: 'draft' } },
    )
  },
}
