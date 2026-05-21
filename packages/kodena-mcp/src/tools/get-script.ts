import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { type ToolDefinition, type ToolInputSchema, zodParser } from './types'

const slugSchema = z
  .object({ slug: z.string().min(1, 'slug is required').max(64) })
  .strict()

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description: 'The script slug (1–64 chars, e.g. "my-blog").',
      minLength: 1,
      maxLength: 64,
    },
  },
  required: ['slug'],
  additionalProperties: false,
}

export const getScriptTool: ToolDefinition<z.infer<typeof slugSchema>> = {
  name: 'kodena_get_script',
  description:
    'Return full details for one Kodena script: deployment metadata, bundle kind, ' +
    'custom-hostname state, asset manifest summary, and timestamps. Use when the user ' +
    'names a specific slug ("show me my-blog", "what is foo?"). Use `kodena_list_scripts` ' +
    'for browsing.',
  inputSchema,
  annotations: { title: 'Get script', readOnlyHint: true },
  parseInput: zodParser(slugSchema),
  async handle({ slug }, ctx: CliContext) {
    return apiFetch(ctx, `/kodena/scripts/${encodeURIComponent(slug)}`)
  },
}
