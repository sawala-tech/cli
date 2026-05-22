import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({
    slugOrId: z.string().min(1),
    patch: z.record(z.string(), z.unknown()),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slugOrId: {
      type: 'string',
      description: 'Schema ULID or human-readable slug to update.',
    },
    patch: {
      type: 'object',
      description:
        'Partial-of-create body. Any subset of `name`, `slug`, `type`, `fields`, `locales`, ' +
        '`staticExport`, `indexFields`. The backend treats the request as PUT replacement semantics.',
    },
  },
  required: ['slugOrId', 'patch'],
  additionalProperties: false,
}

export const kontenaUpdateSchemaTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_update_schema',
  description:
    'Update an existing Kontena content schema. PUT semantics — provide the new shape (subset is OK). ' +
    'Returns the updated row. 404 if the schema does not exist; 409 on slug collisions. ' +
    'Requires admin role on the active org.',
  inputSchema,
  annotations: { title: 'Update Kontena schema', readOnlyHint: false, idempotentHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    return await apiFetch<unknown>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(ctx.activeProjectId)}/schemas/${encodeURIComponent(input.slugOrId)}`,
      { method: 'PUT', body: input.patch },
    )
  },
}
