import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({
    schema: z.record(z.string(), z.unknown()),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    schema: {
      type: 'object',
      description:
        'Schema body to create. Required fields: `name`, `type` (`single` or `collection`), `fields`. ' +
        'Optional: `slug` (auto-derived from name if omitted), `locales`, `staticExport`, `indexFields`.',
    },
  },
  required: ['schema'],
  additionalProperties: false,
}

export const kontenaCreateSchemaTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_create_schema',
  description:
    'Create a new Kontena content schema in the active project. The `schema` input is sent as the POST body; ' +
    'see the Kontena docs for the field-definition shape. Returns the created schema row. The backend rejects ' +
    'duplicate slugs with HTTP 409. Requires admin role on the active org.',
  inputSchema,
  annotations: { title: 'Create Kontena schema', readOnlyHint: false },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    return await apiFetch<unknown>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(ctx.activeProjectId)}/schemas`,
      { method: 'POST', body: input.schema },
    )
  },
}
