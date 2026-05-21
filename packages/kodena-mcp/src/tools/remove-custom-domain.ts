import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const inputZod = z
  .object({ slug: z.string().min(1, 'slug is required').max(64) })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description: 'The script slug whose custom domain to detach.',
      minLength: 1,
      maxLength: 64,
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

export const removeCustomDomainTool: ToolDefinition<z.infer<typeof inputZod>> = {
  name: 'kodena_remove_custom_domain',
  description:
    'Detach the custom hostname currently attached to a Kodena script. After this, ' +
    'requests to the hostname stop reaching the script (until/unless re-attached). ' +
    'Affects DNS-resolution state outside Sawala (openWorldHint). Idempotent: ' +
    'calling on a script with no custom domain is a no-op (200 / 404 depending on ' +
    'backend behaviour).',
  inputSchema,
  annotations: {
    title: 'Remove custom domain',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  parseInput: zodParser(inputZod),
  async handle({ slug }, ctx: CliContext) {
    return apiFetch(
      ctx,
      `/kodena/scripts/${encodeURIComponent(slug)}/custom-domain`,
      { method: 'DELETE' },
    )
  },
}
