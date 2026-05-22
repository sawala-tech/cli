import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({
    slugOrId: z.string().min(1),
    confirm: z.literal(true),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slugOrId: {
      type: 'string',
      description: 'Schema ULID or human-readable slug to delete.',
    },
    confirm: {
      type: 'boolean',
      enum: [true],
      description:
        'Must be `true` to acknowledge the destructive nature of this call. ' +
        'Guards against accidental empty-input invocations.',
    },
  },
  required: ['slugOrId', 'confirm'],
  additionalProperties: false,
}

export const kontenaDeleteSchemaTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_delete_schema',
  description:
    'Delete a Kontena content schema in the active project. **Destructive** — also fails (HTTP 409) if any ' +
    'entries still reference the schema; delete the entries first. Pass `confirm: true` to acknowledge. ' +
    'MCP hosts SHOULD surface this call for human approval before executing.',
  inputSchema,
  annotations: {
    title: 'Delete Kontena schema',
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
    return await apiFetch<unknown>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(ctx.activeProjectId)}/schemas/${encodeURIComponent(input.slugOrId)}`,
      { method: 'DELETE' },
    )
  },
}
