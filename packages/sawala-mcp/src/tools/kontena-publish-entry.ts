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
      description: 'Entry ULID or slug to publish.',
    },
  },
  required: ['schemaSlug', 'slugOrId'],
  additionalProperties: false,
}

export const kontenaPublishEntryTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_publish_entry',
  description:
    "Publish a Kontena collection-entry draft (sets `status='published'`). Idempotent: re-publishing an " +
    'already-published entry is a no-op at the wire level. v1 supports collection schemas only; for ' +
    'single-type schemas use `sawala_kontena_update_entry` with `publish: true` and the locale in `patch`.',
  inputSchema,
  annotations: {
    title: 'Publish Kontena entry',
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
      { method: 'PUT', body: { status: 'published' } },
    )
  },
}
