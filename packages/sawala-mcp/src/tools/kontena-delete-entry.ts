import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface SchemaTypeResponse {
  type: string
  [k: string]: unknown
}

const inputZod = z
  .object({
    schemaSlug: z.string().min(1),
    slugOrId: z.string().min(1),
    locale: z.string().optional(),
    confirm: z.literal(true),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    schemaSlug: {
      type: 'string',
      description: 'Slug of the schema the entry belongs to.',
    },
    slugOrId: {
      type: 'string',
      description:
        'Entry ULID or slug. Ignored for single-type schemas (they target by locale instead).',
    },
    locale: {
      type: 'string',
      description: 'Locale to target (required for single-type schemas).',
    },
    confirm: {
      type: 'boolean',
      enum: [true],
      description:
        'Must be `true` to acknowledge the destructive nature. Guards against accidental empty-input invocations.',
    },
  },
  required: ['schemaSlug', 'slugOrId', 'confirm'],
  additionalProperties: false,
}

export const kontenaDeleteEntryTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_delete_entry',
  description:
    'Delete a Kontena content entry. **Destructive** — also fails (HTTP 409) if the entry is currently ' +
    'published; unpublish first or run `sawala_kontena_unpublish_entry` before retrying. Transparently ' +
    'fetches the schema to route single vs collection. MCP hosts SHOULD surface this call for human approval.',
  inputSchema,
  annotations: {
    title: 'Delete Kontena entry',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    irreversibleHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const projectId = ctx.activeProjectId
    const schemaInfo = await apiFetch<SchemaTypeResponse>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(input.schemaSlug)}`,
    )
    const url =
      schemaInfo.type === 'single'
        ? `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/single/${encodeURIComponent(input.schemaSlug)}` +
          (input.locale ? `?locale=${encodeURIComponent(input.locale)}` : '')
        : `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/collection/${encodeURIComponent(input.schemaSlug)}/${encodeURIComponent(input.slugOrId)}`
    return await apiFetch<unknown>(ctx, url, { method: 'DELETE' })
  },
}
