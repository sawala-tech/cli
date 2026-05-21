import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const inputZod = z
  .object({
    slug: z.string().min(1, 'slug is required').max(64),
    name: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined, {
    message: 'at least one updatable field (name) must be provided',
  })

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description: 'The slug of the script to update.',
      minLength: 1,
      maxLength: 64,
    },
    name: {
      type: 'string',
      description: 'New human-readable display name.',
      minLength: 1,
      maxLength: 128,
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

export const updateScriptTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_update_script',
  description:
    'Update mutable fields on an existing Kodena script. At least one updatable field ' +
    '(currently `name`) must be provided alongside the slug. Idempotent: sending the ' +
    'same payload twice leaves the row in the same final state. Use ' +
    '`kodena_deploy_script` for code/asset changes, `kodena_set_custom_domain` for ' +
    'domain changes — this tool is only for metadata.',
  inputSchema,
  annotations: {
    title: 'Update script',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle({ slug, name }, ctx: CliContext) {
    const body: Record<string, unknown> = {}
    if (name !== undefined) body['name'] = name
    return apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body,
    })
  },
}
